import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LiveMessage } from '../lib/contract';
import { botDelayMs } from '../lib/server/engine';
import { RoomObject } from '../lib/server/room-object';
import { newRoom, roomTtlMs, type Room } from '../lib/server/session';
import { turnMs } from '../lib/server/storm';
import { FakeSocket, fakeState } from './durable';

let now = 1_000_000;
beforeEach(() => {
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => vi.restoreAllMocks());

async function opened(game = 'storm') {
  const fake = fakeState();
  const room = new RoomObject(fake.state as never, {} as never);
  const r = newRoom('ABCD', { game });
  expect(await room.create(r)).toBe(true);
  const run = (command: Record<string, unknown>, token = '') => room.run(command, token);
  const host = (command: Record<string, unknown>) => run(command, r.hostToken);
  async function join(name: string) {
    const { body } = await run({ action: 'join', name });
    await run({ action: 'ready', ready: true }, body.playerToken as string);
    return body as { playerId: string; playerToken: string };
  }
  async function socket(token: string) {
    const ws = new FakeSocket();
    fake.state.acceptWebSocket(ws);
    await room.webSocketMessage(ws as never, JSON.stringify({ token }));
    return ws;
  }
  const stored = () => fake.store.get('room') as Room;
  return { fake, room, run, host, join, socket, stored, hostToken: r.hostToken };
}

describe('room in a Durable Object', () => {
  it('keeps one room per code, until it expires', async () => {
    const { room, fake } = await opened();
    expect(await room.create(newRoom('ABCD', {}))).toBe(false);
    now += roomTtlMs;
    expect(await room.create(newRoom('ABCD', {}))).toBe(true);
    expect((fake.store.get('room') as Room).game).toBe('quiz');
  });

  it('answers commands like the HTTP route, errors included', async () => {
    const { run, host, join } = await opened();
    const ana = await join('Ana');
    await join('Bo');
    expect(await run({ action: 'start' }, ana.playerToken)).toEqual({
      status: 403,
      body: { error: expect.stringContaining('host') },
    });
    const started = await host({ action: 'start' });
    expect(started.status).toBe(200);
    expect(started.body.room).toMatchObject({ phase: 'playing' });
    expect(await run({ action: 'view' }, 'nobody')).toMatchObject({ status: 403 });
  });

  it("asks for the quiz's questions before starting one, so nothing slips in while they load", async () => {
    const { host, join } = await opened('quiz');
    await join('Ana');
    expect(await host({ action: 'start' })).toEqual({ status: 200, body: {}, questions: true });
  });

  it('moves a match on with no request: a bot plays, then a silent phone runs out of time', async () => {
    const { fake, room, host, join, stored } = await opened();
    const ana = await join('Ana');
    await host({ action: 'addBot' });
    await host({ action: 'start' });
    const r = stored();
    const bot = r.players.find((p) => p.bot)!.id;
    // Seat the bot first, then let the room wake by itself.
    r.storm!.order = [bot, ana.playerId];
    r.storm!.turn = bot;
    fake.store.set('room', r);
    await host({ action: 'pause' });
    await host({ action: 'resume' });
    expect(fake.alarm()).toBe(now + botDelayMs);
    now = fake.alarm()!;
    await room.alarm();
    const afterBot = stored().storm!;
    expect(afterBot.seq).toBe(1);
    expect(afterBot.event?.by).toBe(bot);
    // The bot may keep a streak going; whenever Ana holds the turn, her clock runs out alone.
    while (stored().storm!.turn !== ana.playerId) {
      now = fake.alarm()!;
      await room.alarm();
    }
    expect(fake.alarm()).toBe(now + turnMs);
    now = fake.alarm()!;
    await room.alarm();
    expect(stored().storm!.event).toMatchObject({ kind: 'draw', by: ana.playerId });
  });

  it('pushes every socket its own view of a change: each player their hand, the host none', async () => {
    const { run, host, join, socket, hostToken } = await opened();
    const ana = await join('Ana');
    const bo = await join('Bo');
    const screens = {
      tv: await socket(hostToken),
      ana: await socket(ana.playerToken),
      bo: await socket(bo.playerToken),
    };
    await host({ action: 'start' });
    for (const ws of Object.values(screens)) expect(LiveMessage.safeParse(ws.last()).success).toBe(true);
    expect(screens.tv.last()!.room!.storm!.hand).toBeUndefined();
    const anaHand = screens.ana.last()!.room!.storm!.hand;
    const boHand = screens.bo.last()!.room!.storm!.hand;
    expect(anaHand).toHaveLength(7);
    expect(boHand).toHaveLength(7);
    expect(JSON.stringify(screens.tv.sent)).not.toContain(JSON.stringify(anaHand));
    await run({ action: 'cheer', emoji: '🔥' }, ana.playerToken);
    expect(screens.bo.sent.length).toBeGreaterThan(1);
  });

  it('closes a socket that names no seat, and one whose seat is no longer its own', async () => {
    const { fake, host, join, socket, stored } = await opened();
    const stranger = await socket('not-a-token');
    expect(stranger.last()).toEqual({ error: 'Join this room first.' });
    expect(stranger.closed).toBe(4003);
    const ana = await join('Ana');
    const ws = await socket(ana.playerToken);
    const r = stored();
    r.players[0].token = 'a-new-phone-token';
    fake.store.set('room', r);
    await host({ action: 'addBot' });
    expect(ws.last()).toEqual({ error: 'This seat is no longer yours.' });
    expect(ws.closed).toBe(4003);
  });

  it('counts a phone with an open socket as here, with no request for a minute', async () => {
    const { host, join, socket } = await opened();
    const ana = await join('Ana');
    const bo = await join('Bo');
    await socket(ana.playerToken);
    now += 60_000;
    const { body } = await host({ action: 'view' });
    const connected = Object.fromEntries(
      (body.room as { players: { id: string; connected: boolean }[] }).players.map((p) => [
        p.id,
        p.connected,
      ]),
    );
    expect(connected).toEqual({ [ana.playerId]: true, [bo.playerId]: false });
  });

  it('wakes once a socket has been closed long enough, to tell the others the player has gone', async () => {
    const { fake, room, join, socket, hostToken } = await opened();
    const ana = await join('Ana');
    const tv = await socket(hostToken);
    const phone = await socket(ana.playerToken);
    await room.webSocketClose(phone as never);
    expect(fake.alarm()).toBeLessThanOrEqual(now + 25_100);
    now = fake.alarm()!;
    await room.alarm();
    expect(tv.last()!.room!.players[0]).toMatchObject({ id: ana.playerId, connected: false });
  });

  it('forgets the room once it expires', async () => {
    const { fake, room } = await opened();
    now = fake.alarm()!;
    expect(now).toBeGreaterThanOrEqual(1_000_000 + roomTtlMs);
    await room.alarm();
    expect(fake.store.size).toBe(0);
  });
});
