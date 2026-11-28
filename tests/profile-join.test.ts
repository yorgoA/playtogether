import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import { POST as account } from '../app/api/profile/route';
import { POST as roomPost } from '../app/api/rooms/[code]/route';
import { POST as createRoute } from '../app/api/rooms/route';
import { CreateRoomResponse, RoomResponse } from '../lib/contract';
import { cookieFrom, json, post } from './api-helpers';
import { useDatabase } from './database';
import { fakeRooms } from './durable';

// A real date: sign-up refuses a birth date after the clock.
const T0 = Date.UTC(2026, 10, 28, 12);
const bindings = env as { ROOMS?: unknown; ROOM_HOST?: string };
beforeEach(() => {
  useDatabase();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  delete bindings.ROOMS;
  delete bindings.ROOM_HOST;
});

const ctx = (code: string) => ({ params: Promise.resolve({ code }) });
async function signUp(name: string, avatar = '🐙') {
  const res = await account(
    post('/api/profile', {
      action: 'register',
      name,
      password: 'correct horse',
      birthday: '1990-05-17',
      avatar,
    }),
  );
  return { cookie: cookieFrom(res), id: (await json(res)).profile.id as string };
}
async function room() {
  return CreateRoomResponse.parse(await json(await createRoute(post('/api/rooms', { game: 'quiz' })))).code;
}
async function join(code: string, body: Record<string, unknown>, cookie = '') {
  const res = await roomPost(
    post('/api/rooms/' + code, { action: 'join', ...body }, cookie ? { cookie } : {}),
    ctx(code),
  );
  const reply = await json(res);
  const parsed = reply.room ? RoomResponse.parse(reply) : undefined;
  return {
    status: res.status,
    error: reply.error as string | undefined,
    playerId: parsed?.playerId,
    playerToken: parsed?.playerToken,
    room: parsed?.room,
  };
}
type Joined = Awaited<ReturnType<typeof join>>;
const seat = (reply: Joined) => reply.room!.players.find((p) => p.id === reply.playerId)!;

describe.each([
  ['D1', () => {}],
  [
    'Durable Objects',
    () => {
      bindings.ROOMS = fakeRooms();
      bindings.ROOM_HOST = 'durable';
    },
  ],
])('joining with a profile, rooms in %s', (_, setup) => {
  beforeEach(setup);

  it('joins with the profile name and avatar, nothing typed, and never shows the profile', async () => {
    const sam = await signUp('Sam');
    const code = await room();
    const joined = await join(code, { color: '#69dafa' }, sam.cookie);
    expect(joined.status).toBe(200);
    expect(seat(joined)).toMatchObject({ name: 'Sam', avatar: '🐙', color: '#69dafa', signedIn: true });
    // Neither the snapshot nor the seat's view of itself carries the profile id.
    expect(JSON.stringify(joined)).not.toContain(sam.id);
    const guest = await join(code, { name: 'Leo' });
    expect(seat(guest).signedIn).toBe(false);
    expect(guest.room!.players.find((p) => p.name === 'Sam')!.signedIn).toBe(true);
  });

  it('lets a signed-in phone join as a guest, and needs a nickname for any guest', async () => {
    const sam = await signUp('Sam');
    const code = await room();
    expect((await join(code, { guest: true }, sam.cookie)).status).toBe(400);
    expect((await join(code, {})).status).toBe(400);
    const asGuest = await join(code, { guest: true, name: 'Mystery', avatar: '🦊' }, sam.cookie);
    expect(seat(asGuest)).toMatchObject({ name: 'Mystery', avatar: '🦊', signedIn: false });
  });

  it('ignores a profile a phone claims in its command', async () => {
    const sam = await signUp('Sam');
    const code = await room();
    const forged = await join(code, { name: 'Leo', profileId: sam.id, signedIn: true });
    expect(forged.status).toBe(200);
    expect(seat(forged)).toMatchObject({ name: 'Leo', signedIn: false });
  });

  it('keeps one seat per profile, given back to that profile only', async () => {
    const sam = await signUp('Sam');
    const code = await room();
    const first = await join(code, {}, sam.cookie);
    const second = await join(code, {}, sam.cookie);
    expect(second.status).toBe(409);
    expect(second.error).toMatch(/already playing/);
    // Once Sam's phone has gone quiet, a guest typing "Sam" cannot take the seat, but Sam's profile can.
    vi.setSystemTime(T0 + 30_000);
    expect((await join(code, { name: 'Sam' })).status).toBe(400);
    const back = await join(code, {}, sam.cookie);
    expect(back.status).toBe(200);
    expect(back.playerId).toBe(first.playerId);
    expect(back.playerToken).not.toBe(first.playerToken);
  });

  it('refuses a profile whose name a guest already took', async () => {
    const sam = await signUp('Sam');
    const code = await room();
    await join(code, { name: 'sam' });
    const clash = await join(code, {}, sam.cookie);
    expect(clash.status).toBe(400);
    expect(clash.error).toMatch(/Join as a guest/);
  });
});
