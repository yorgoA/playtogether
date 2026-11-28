import { DurableObject } from 'cloudflare:workers';
import { LiveHello } from '../contract';
import { GameError } from './games';
import { knows, mutate, nextWake, roomTtlMs, snapshot, stillHere, tick, type Room } from './session';
import type { Question } from './trivia';

// What the room answers the Worker, which sends it on as is. `questions` asks for the quiz's questions first.
export type RoomReply = { status: number; body: Record<string, unknown>; questions?: true };
// `opened` until the hello names a seat, then `token` and when it said hello.
type Socket = { token?: string; opened?: number; seen?: number };
// A phone that stops answering counts as gone after this long, so the room wakes then to tell the others.
const presenceMs = 25_000;
// A socket must name its seat this soon after opening, or it is closed.
const helloMs = 5_000;

// One room. It keeps its state in its own storage and handles one call at a time, so it needs no version lock.
// An alarm wakes it for deadlines and bots, and it pushes each open socket its own view whenever it changes.
// Nothing is kept in fields: the object may sleep between calls, sockets included.
export class RoomObject extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    // Screens send `ping` every 10 s. The runtime answers without waking the room and keeps the time.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  // Refuses a code still in use. The Worker then tries another.
  async create(room: Room): Promise<boolean> {
    const now = Date.now();
    if (await this.load(now)) return false;
    await this.save(room, now);
    return true;
  }

  async run(command: Record<string, unknown>, token: string, questions?: Question[]): Promise<RoomReply> {
    const now = Date.now();
    const r = await this.load(now);
    if (!r) return { status: 404, body: { error: 'Room code not found.' } };
    const starting = command.action === 'start' || command.action === 'restart';
    // Fetching questions here would let another call slip in between reading and saving the room.
    if (starting && r.game === 'quiz' && token === r.hostToken && !questions)
      return { status: 200, body: {}, questions: true };
    this.sweep(now);
    const here = stillHere(r, this.tokens(now), now);
    try {
      const { dirty, extras } = mutate(r, command, token, now, questions);
      if (dirty || here) await this.save(r, now);
      return { status: 200, body: { ...extras, room: snapshot(r, now, extras.playerToken || token) } };
    } catch (e) {
      if (here) await this.save(r, now);
      if (e instanceof GameError) return { status: e.status, body: { error: e.message } };
      throw e;
    }
  }

  async alarm() {
    const now = Date.now();
    this.sweep(now);
    const r = await this.load(now);
    if (!r) {
      for (const ws of this.sockets()) ws.close(4004, 'Room closed');
      return;
    }
    try {
      // The room wakes every ping window while sockets are open, so fresher presence alone is not saved:
      // the next call works it out again from the sockets.
      stillHere(r, this.tokens(now), now);
      if (tick(r, now)) await this.save(r, now);
      else {
        // Nothing to save, but who is connected may have changed: wake for what comes next and show it.
        await this.wake(r, now, (await this.ctx.storage.get<number>('expires'))!);
        this.show(r, now);
      }
    } catch (e) {
      // A rule that keeps failing must not retry forever. The next request or wake tries again.
      console.error('Room alarm failed', e instanceof Error ? e.message : 'unknown');
      await this.ctx.storage.setAlarm(now + presenceMs);
    }
  }

  async fetch(req: Request) {
    if (req.headers.get('Upgrade')?.toLowerCase() !== 'websocket')
      return Response.json({ error: 'Open this address as a WebSocket.' }, { status: 426 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    const now = Date.now();
    server.serializeAttachment({ opened: now } satisfies Socket);
    await this.wakeBy(now + helloMs + 100);
    return new Response(null, { status: 101, webSocket: client });
  }

  // The socket's first message names who is watching. Anything after that is ignored.
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if ((ws.deserializeAttachment() as Socket | null)?.token) return;
    const now = Date.now();
    const r = await this.load(now);
    let hello: unknown;
    try {
      hello = JSON.parse(typeof message === 'string' ? message : new TextDecoder().decode(message));
    } catch {}
    const checked = LiveHello.safeParse(hello);
    if (!r || !checked.success || !knows(r, checked.data.token)) {
      // One reply whether the room exists or not, so a socket cannot be used to guess codes.
      ws.send(JSON.stringify({ error: 'Join this room first.' }));
      ws.close(4003, 'Not in this room');
      return;
    }
    const { token } = checked.data;
    ws.serializeAttachment({ token, seen: now } satisfies Socket);
    if (stillHere(r, [token], now)) await this.save(r, now);
    else {
      ws.send(JSON.stringify({ room: snapshot(r, now, token) }));
      await this.wakeBy(now + presenceMs + 100);
    }
  }

  // The others learn the player has gone once the presence window has passed.
  async webSocketClose(ws: WebSocket) {
    ws.close();
    await this.wakeBy(Date.now() + presenceMs + 100);
  }

  // Sockets still open: one closed earlier in this call stays listed until the call ends.
  private sockets() {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN);
  }

  // Seats with a socket that said hello and answered a ping, or said hello, within the presence window.
  private tokens(now: number) {
    return this.sockets().flatMap((ws) => {
      const s = ws.deserializeAttachment() as Socket | null;
      return s?.token && now - this.lastHeard(ws, s) < presenceMs ? [s.token] : [];
    });
  }

  private lastHeard(ws: WebSocket, s: Socket) {
    return Math.max(s.seen ?? 0, this.ctx.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? 0);
  }

  // Closes a socket that never said hello, and one that stopped pinging: a phone gone without a goodbye,
  // which would otherwise count as here until the connection times out.
  private sweep(now: number) {
    for (const ws of this.sockets()) {
      const s = (ws.deserializeAttachment() as Socket | null) ?? {};
      if (!s.token && now - (s.opened ?? 0) >= helloMs) ws.close(4001, 'No hello');
      else if (s.token && now - this.lastHeard(ws, s) >= presenceMs) ws.close(4008, 'No ping');
    }
  }

  // The next check of the sockets: a hello due, or a ping missed.
  private checkAt(now: number) {
    let at = Infinity;
    for (const ws of this.sockets()) {
      const s = (ws.deserializeAttachment() as Socket | null) ?? {};
      const due = s.token ? this.lastHeard(ws, s) + presenceMs : (s.opened ?? now) + helloMs;
      at = Math.min(at, Math.max(due, now) + 100);
    }
    return at;
  }

  private async wakeBy(at: number) {
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null || alarm > at) await this.ctx.storage.setAlarm(at);
  }

  private async load(now: number) {
    const [room, expires] = await Promise.all([
      this.ctx.storage.get<Room>('room'),
      this.ctx.storage.get<number>('expires'),
    ]);
    if (room && expires && expires > now) return room;
    if (room) await this.ctx.storage.deleteAll();
    return null;
  }

  // Saves the room, wakes it for what comes next, and shows every socket the change.
  private async save(r: Room, now: number) {
    const expires = now + roomTtlMs;
    await this.ctx.storage.put({ room: r, expires });
    await this.wake(r, now, expires);
    this.show(r, now);
  }

  // One alarm covers the next deadline or bot move, the next socket check, and the room's end.
  private async wake(r: Room, now: number, expires: number) {
    await this.ctx.storage.setAlarm(Math.min(nextWake(r, now) ?? expires, this.checkAt(now), expires));
  }

  private show(r: Room, now: number) {
    for (const ws of this.sockets()) {
      const token = (ws.deserializeAttachment() as Socket | null)?.token;
      if (!token) continue;
      if (knows(r, token)) ws.send(JSON.stringify({ room: snapshot(r, now, token) }));
      else {
        // The seat moved to another phone, or the player was removed.
        ws.send(JSON.stringify({ error: 'This seat is no longer yours.' }));
        ws.close(4003, 'Seat moved');
      }
    }
  }
}
