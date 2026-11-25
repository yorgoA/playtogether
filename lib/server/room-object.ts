import { DurableObject } from 'cloudflare:workers';
import { LiveHello } from '../contract';
import { GameError } from './games';
import { knows, mutate, nextWake, roomTtlMs, snapshot, stillHere, tick, type Room } from './session';
import type { Question } from './trivia';

// What the room answers the Worker, which sends it on as is. `questions` asks for the quiz's questions first.
export type RoomReply = { status: number; body: Record<string, unknown>; questions?: true };
type Socket = { token?: string };
// A phone that stops answering counts as gone after this long, so the room wakes then to tell the others.
const presenceMs = 25_000;

// One room. It keeps its state in its own storage and handles one call at a time, so it needs no version lock.
// An alarm wakes it for deadlines and bots, and it pushes each open socket its own view whenever it changes.
// Nothing is kept in fields: the object may sleep between calls, sockets included.
export class RoomObject extends DurableObject {
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
    const here = stillHere(r, this.tokens(), now);
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
    const r = await this.load(now);
    if (!r) return;
    try {
      const here = stillHere(r, this.tokens(), now);
      if (tick(r, now) || here) await this.save(r, now);
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
    server.serializeAttachment({} satisfies Socket);
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
      ws.send(JSON.stringify({ error: r ? 'Join this room first.' : 'Room code not found.' }));
      ws.close(4003, 'Not in this room');
      return;
    }
    const { token } = checked.data;
    ws.serializeAttachment({ token } satisfies Socket);
    if (stillHere(r, [token], now)) await this.save(r, now);
    else ws.send(JSON.stringify({ room: snapshot(r, now, token) }));
  }

  // The others learn the player has gone once the presence window has passed.
  async webSocketClose(ws: WebSocket) {
    ws.close();
    const wake = Date.now() + presenceMs + 100;
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm === null || alarm > wake) await this.ctx.storage.setAlarm(wake);
  }

  private tokens() {
    return this.ctx
      .getWebSockets()
      .map((ws) => (ws.deserializeAttachment() as Socket | null)?.token)
      .filter((token): token is string => !!token);
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

  // One alarm covers the next deadline or bot move, and the room's end.
  private async wake(r: Room, now: number, expires: number) {
    await this.ctx.storage.setAlarm(Math.min(nextWake(r, now) ?? expires, expires));
  }

  private show(r: Room, now: number) {
    for (const ws of this.ctx.getWebSockets()) {
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
