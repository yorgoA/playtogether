import { beforeEach, describe, expect, it } from 'vitest';
import { RoomResponse } from '../lib/contract';
import { GET as roomRoute, POST as roomPost } from '../app/api/rooms/[code]/route';
import { POST as createRoute } from '../app/api/rooms/route';
import { get, json, post } from './api-helpers';
import { useDatabase } from './database';

let sqlite: ReturnType<typeof useDatabase>;
beforeEach(() => {
  sqlite = useDatabase();
});

const ctx = (code: string) => ({ params: Promise.resolve({ code }) });
const bearer = (token: string) => ({ authorization: 'Bearer ' + token });
async function newRoom(game = 'quiz') {
  const response = await createRoute(post('/api/rooms', { game }));
  return { ...(await json(response)), status: response.status } as {
    status: number;
    code: string;
    hostToken: string;
  };
}
const send = async (code: string, body: unknown, token = '') =>
  json(await roomPost(post('/api/rooms/' + code, body, bearer(token)), ctx(code)));
const view = (code: string, token: string) => roomRoute(get('/api/rooms/' + code, bearer(token)), ctx(code));

describe('rooms', () => {
  it('creates a stored room with a four-character code and a host token', async () => {
    const room = await newRoom();
    expect(room.status).toBe(201);
    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
    expect(sqlite.prepare('SELECT code, version FROM rooms').all()).toEqual([
      { code: room.code, version: 0 },
    ]);
    expect(await json(await view(room.code, room.hostToken))).toMatchObject({
      room: { phase: 'lobby', game: 'quiz' },
    });
  });
  it('plays a join, ready and start flow through the stored state', async () => {
    const { code, hostToken } = await newRoom();
    const joined = await send(code, { action: 'join', name: 'Ana' });
    await send(code, { action: 'ready', ready: true }, joined.playerToken);
    const started = await send(code, { action: 'start' }, hostToken);
    expect(started.room.phase).toBe('playing');
    expect((await json(await view(code.toLowerCase(), joined.playerToken))).room.players[0].name).toBe('Ana');
    expect(sqlite.prepare('SELECT version FROM rooms').get()).toEqual({ version: 3 });
  });
  it('plays a Storm Deck turn through the stored state, showing each hand only to its owner', async () => {
    const { code, hostToken } = await newRoom('storm');
    const seats = [];
    for (const name of ['Ana', 'Bo']) {
      const joined = await send(code, { action: 'join', name });
      await send(code, { action: 'ready', ready: true }, joined.playerToken);
      seats.push(joined);
    }
    const { room } = await send(code, { action: 'start' }, hostToken);
    expect(room.storm.hand).toBeUndefined();
    const first = seats.find((seat) => seat.playerId === room.storm.turn)!;
    const other = seats.find((seat) => seat !== first)!;
    const drawn = await send(code, { action: 'storm', move: 'draw', seq: room.storm.seq }, first.playerToken);
    expect(drawn.room.storm).toMatchObject({ seq: 1, turn: other.playerId });
    expect(drawn.room.storm.hand).toHaveLength(8);
    const seen = (await json(await view(code, other.playerToken))).room.storm;
    expect(seen.hand).toHaveLength(7);
    expect(seen.sizes[first.playerId]).toBe(8);
    const stale = await send(code, { action: 'storm', move: 'draw', seq: 0 }, other.playerToken);
    expect(stale.error).toBe('The table has moved on.');
  });
  it('asks the host before handing a seat, and its hidden hand, to another phone mid-match', async () => {
    const { code, hostToken } = await newRoom('storm');
    const seats = [];
    for (const [name, joinId] of [
      ['Ana', 'ana-first-phone-01'],
      ['Bo', 'bo-first-phone-001'],
    ]) {
      const joined = await send(code, { action: 'join', name, joinId });
      await send(code, { action: 'ready', ready: true }, joined.playerToken);
      seats.push(joined);
    }
    await send(code, { action: 'start' }, hostToken);
    // Ana's phone goes quiet.
    const stored = JSON.parse((sqlite.prepare('SELECT state FROM rooms').get() as { state: string }).state);
    stored.players[0].lastSeen = 0;
    sqlite.prepare('UPDATE rooms SET state = ?').run(JSON.stringify(stored));
    const asking = await send(code, { action: 'join', name: 'Ana', joinId: 'ana-second-phone-2' });
    expect(RoomResponse.parse(asking)).toMatchObject({ pending: true });
    expect(asking.playerToken).toBeUndefined();
    expect(asking.room.storm.hand).toBeUndefined();
    const { room } = RoomResponse.parse(await json(await view(code, hostToken)));
    expect(room.claims).toEqual([{ id: expect.any(String), seat: seats[0].playerId }]);
    const answer = { action: 'claim', id: room.claims[0].id, accept: true };
    expect((await send(code, answer, seats[1].playerToken)).error).toMatch(/host/);
    await send(code, answer, hostToken);
    const back = await send(code, { action: 'join', name: 'Ana', joinId: 'ana-second-phone-2' });
    expect(back.playerId).toBe(seats[0].playerId);
    expect(back.room.storm.hand).toHaveLength(7);
    expect((await view(code, seats[0].playerToken)).status).toBe(403);
  });

  it('keeps secrets out of what a player can read', async () => {
    const { code, hostToken } = await newRoom();
    const joined = await send(code, { action: 'join', name: 'Ana' });
    const text = JSON.stringify(await json(await view(code, joined.playerToken)));
    expect(text).not.toContain(hostToken);
    expect(text).not.toContain(joined.playerToken);
  });
  it('rejects bad requests with the right status', async () => {
    const { code } = await newRoom();
    const status = async (response: Response) => response.status;
    expect(await status(await roomRoute(get('/api/rooms/ZZZZ'), ctx('ZZZZ')))).toBe(404);
    expect(await status(await roomRoute(get('/api/rooms/ab'), ctx('ab')))).toBe(404);
    expect(await status(await roomRoute(get('/api/rooms/' + code), ctx(code)))).toBe(403);
    expect(await status(await roomPost(post('/api/rooms/' + code, { action: 'start' }), ctx(code)))).toBe(
      403,
    );
    const big = await roomPost(
      post('/api/rooms/' + code, { action: 'join', name: 'x'.repeat(3000) }),
      ctx(code),
    );
    expect(big.status).toBe(413);
    const text = await roomPost(
      new Request('http://localhost/x', {
        method: 'POST',
        body: '{}',
        headers: { 'content-type': 'text/plain' },
      }),
      ctx(code),
    );
    expect(text.status).toBe(415);
    expect((await createRoute(post('/api/rooms', { game: 'chess' }))).status).toBe(400);
    expect((await createRoute(post('/api/rooms', { rounds: 99 }))).status).toBe(400);
  });
  it('does not return rooms that have expired, and removes them when a new room is made', async () => {
    const old = await newRoom();
    sqlite.prepare('UPDATE rooms SET expires = 1').run();
    expect((await view(old.code, old.hostToken)).status).toBe(404);
    await newRoom();
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM rooms WHERE code = ?').get(old.code)).toEqual({ n: 0 });
  });
  it('applies simultaneous updates one after the other without losing any', async () => {
    const { code } = await newRoom();
    const names = ['A', 'B', 'C', 'D', 'E', 'F'];
    const results = await Promise.all(names.map((name) => send(code, { action: 'join', name })));
    const joined = results.filter((r) => r.playerToken);
    const room = await json(await view(code, joined[0].playerToken));
    expect(room.room.players).toHaveLength(joined.length);
    expect(joined.length).toBeGreaterThan(0);
  });
  it('reports unavailable storage as a 503 without leaking details', async () => {
    const { env } = await import('cloudflare:workers');
    (env as { DB?: unknown }).DB = undefined;
    const response = await createRoute(post('/api/rooms', {}));
    expect(response.status).toBe(503);
    expect(JSON.stringify(await json(response))).not.toMatch(/DB|sqlite|stack/i);
  });
});
