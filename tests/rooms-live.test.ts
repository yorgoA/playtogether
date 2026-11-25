import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { CreateRoomResponse, RoomResponse } from '../lib/contract';
import { GET as roomRoute, POST as roomPost } from '../app/api/rooms/[code]/route';
import { POST as createRoute } from '../app/api/rooms/route';
import { get, json, post } from './api-helpers';
import { fakeRooms } from './durable';

// The test stand-in for `cloudflare:workers`, switched to rooms in Durable Objects with no D1 at all.
const bindings = env as { DB?: unknown; ROOMS?: unknown; ROOM_HOST?: string };
beforeEach(() => {
  bindings.DB = undefined;
  bindings.ROOMS = fakeRooms();
  bindings.ROOM_HOST = 'durable';
});
afterEach(() => {
  delete bindings.ROOMS;
  delete bindings.ROOM_HOST;
});

const ctx = (code: string) => ({ params: Promise.resolve({ code }) });
const bearer = (token: string) => ({ authorization: 'Bearer ' + token });
const send = async (code: string, body: unknown, token = '') => {
  const response = await roomPost(post('/api/rooms/' + code, body, bearer(token)), ctx(code));
  const reply = await json(response);
  reply.status = response.status;
  return reply;
};
async function newRoom(game: string) {
  const response = await createRoute(post('/api/rooms', { game }));
  const body = CreateRoomResponse.parse(await json(response));
  return { status: response.status, ...body };
}

describe('rooms in Durable Objects', () => {
  it('create, join, start and view a room through the same routes, without D1', async () => {
    const { status, code, hostToken, room } = await newRoom('storm');
    expect(status).toBe(201);
    expect(room.live).toBe(true);
    const seats = [];
    for (const name of ['Ana', 'Bo']) {
      const joined = await send(code, { action: 'join', name });
      const { status, ...reply } = joined;
      expect(status).toBe(200);
      expect(RoomResponse.parse(reply).playerToken).toBeTruthy();
      await send(code, { action: 'ready', ready: true }, joined.playerToken);
      seats.push(joined);
    }
    const started = await send(code, { action: 'start' }, hostToken);
    expect(started.room.phase).toBe('playing');
    const seen = await roomRoute(
      get('/api/rooms/' + code.toLowerCase(), bearer(seats[0].playerToken)),
      ctx(code),
    );
    const view = RoomResponse.parse(await json(seen)).room;
    expect(view.storm!.hand).toHaveLength(7);
    expect(view.live).toBe(true);
  });

  it('fetches the questions outside the room when the host starts a quiz', async () => {
    const { code, hostToken } = await newRoom('quiz');
    const ana = await send(code, { action: 'join', name: 'Ana' });
    await send(code, { action: 'ready', ready: true }, ana.playerToken);
    const started = await send(code, { action: 'start' }, hostToken);
    expect(started.status).toBe(200);
    expect(started.room).toMatchObject({ phase: 'playing', round: 1 });
  });

  it('keeps the HTTP errors: a code with no room, and a stranger', async () => {
    const { code } = await newRoom('quiz');
    expect((await send('ZZZZ', { action: 'join', name: 'Ana' })).status).toBe(404);
    expect((await roomRoute(get('/api/rooms/' + code), ctx(code))).status).toBe(403);
  });
});
