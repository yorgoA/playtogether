import { env } from 'cloudflare:workers';
import { adultGames, CreateRoomRequest, gameIds, RoomCommand } from '../contract';
import { award, ended } from './achievements';
import { readText } from './body';
import { GameError } from './games';
import { current, publicProfile } from './profiles';
import type { RoomObject } from './room-object';
import { findQuestions, type Question } from './trivia';
import { mutate, newRoom, roomTtlMs as ttl, snapshot, type Joiner, type Room } from './session';

function db() {
  if (!env.DB) throw new GameError('Room storage is unavailable.', 503);
  return env.DB;
}
// While `ROOM_HOST` is `durable`, rooms live in Durable Objects, one per code, and D1 is not used for them.
const durable = () => env.ROOM_HOST === 'durable';
function roomAt(code: string) {
  if (!env.ROOMS) throw new GameError('Room storage is unavailable.', 503);
  // RPC typing cannot follow the rooms' loose JSON shapes, so the two calls are typed from the class.
  return env.ROOMS.get(env.ROOMS.idFromName(code)) as unknown as Pick<RoomObject, 'create' | 'run'>;
}
async function body(req: Request): Promise<Record<string, unknown>> {
  if (!req.headers.get('content-type')?.includes('application/json')) throw new GameError('Send JSON.', 415);
  const raw = await readText(req);
  if (raw === null) throw new GameError('Request too large.', 413);
  try {
    const obj = JSON.parse(raw);
    if (obj && !Array.isArray(obj) && typeof obj === 'object') return obj;
  } catch {}
  throw new GameError('Enter valid room settings.');
}
// The first problem found, named by field, so a screen's developer can see what to fix.
function invalid(error: { issues: { path: PropertyKey[]; message: string }[] }): never {
  const issue = error.issues[0];
  const field = issue?.path.join('.');
  throw new GameError('Invalid request' + (field ? ': ' + field + ' — ' + issue.message : '.'));
}
async function checkAge(req: Request, game: unknown) {
  if (typeof game === 'string' && adultGames.includes(game) && !publicProfile(await current(req))?.adult)
    throw new GameError('Sign in with an 18+ profile to play drinking games.', 403);
}
const reply = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
function failure(e: unknown) {
  if (e instanceof GameError) return reply({ error: e.message }, e.status);
  console.error('Room storage operation failed', e instanceof Error ? e.message : 'unknown');
  return reply({ error: 'Room service is temporarily unavailable.' }, 503);
}
function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(4)), (v) => alphabet[v % alphabet.length]).join('');
}
export async function create(req: Request) {
  try {
    const command = await body(req);
    const checked = CreateRoomRequest.safeParse(command);
    if (!checked.success) invalid(checked.error);
    await checkAge(req, command.game);
    if (durable()) {
      for (let i = 0; i < 8; i++) {
        const code = makeCode(),
          r: Room = { ...newRoom(code, command), live: true };
        if (await roomAt(code).create(r))
          return reply({ code, hostToken: r.hostToken, room: snapshot(r, Date.now()) }, 201);
      }
      throw new GameError('Please try creating the room again.', 503);
    }
    const store = db(),
      now = Date.now();
    await store.prepare('DELETE FROM rooms WHERE expires < ?').bind(now).run();
    for (let i = 0; i < 8; i++) {
      const code = makeCode(),
        r = newRoom(code, command);
      const result = await store
        .prepare('INSERT OR IGNORE INTO rooms (code,version,state,expires) VALUES (?,0,?,?)')
        .bind(code, JSON.stringify(r), now + ttl)
        .run();
      if (result.meta.changes) return reply({ code, hostToken: r.hostToken, room: snapshot(r, now) }, 201);
    }
    throw new GameError('Please try creating the room again.', 503);
  } catch (e) {
    return failure(e);
  }
}
export async function handle(req: Request, rawCode: string) {
  try {
    const code = rawCode.toUpperCase();
    if (!/^[A-Z2-9]{4}$/.test(code)) throw new GameError('Room code not found.', 404);
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer /i, '');
    const command = req.method === 'GET' ? { action: 'view' } : await body(req);
    const checked = RoomCommand.safeParse(command);
    if (!checked.success) invalid(checked.error);
    if (command.action === 'configure') await checkAge(req, command.game);
    // Read from the phone's own session, so a phone can only join as the profile it is signed in to.
    const signedIn = command.action === 'join' && command.guest !== true ? await current(req) : null;
    const joiner: Joiner | undefined = signedIn
      ? { id: signedIn.id, name: signedIn.name, avatar: signedIn.avatar }
      : undefined;
    if (durable()) {
      // The room asks for quiz questions before starting one; they are fetched here, outside the room.
      let questions: Question[] | undefined;
      for (;;) {
        const answer = await roomAt(code).run(command, token, questions, joiner);
        if (!answer.questions || questions) return reply(answer.body, answer.status);
        questions = await findQuestions(Date.now());
      }
    }
    const store = db();
    let questions: Question[] | undefined;
    for (let i = 0; i < 12; i++) {
      const now = Date.now();
      const row = await store
        .prepare('SELECT state, version FROM rooms WHERE code=? AND expires>?')
        .bind(code, now)
        .first<{ state: string; version: number }>();
      if (!row) throw new GameError('Room code not found.', 404);
      const r: Room = JSON.parse(row.state);
      // Rooms opened before a game was removed, or before its rules changed shape.
      if (!gameIds.includes(r.game)) throw new GameError('Room code not found.', 404);
      if (
        (r.phase === 'playing' || r.phase === 'paused') &&
        ((r.game === 'quiz' && !r.quiz) || (r.game === 'reaction' && !r.duel))
      )
        r.phase = 'lobby';
      const starting = command.action === 'start' || command.action === 'restart';
      if (starting && r.game === 'quiz' && token === r.hostToken && !questions) {
        questions = await findQuestions(now);
        // Fetching takes a moment, so look at the room again.
        continue;
      }
      const before = r.phase;
      const { dirty, extras } = mutate(r, command, token, now, questions, joiner);
      if (dirty) {
        const result = await store
          .prepare('UPDATE rooms SET state=?, version=version+1, expires=? WHERE code=? AND version=?')
          .bind(JSON.stringify(r), now + ttl, code, row.version)
          .run();
        if (!result.meta.changes) continue;
        if (ended(before, r)) await award(r, now);
      }
      return reply({ ...extras, room: snapshot(r, now, extras.playerToken || token) });
    }
    throw new GameError('The room is busy. Try again.', 409);
  } catch (e) {
    return failure(e);
  }
}
