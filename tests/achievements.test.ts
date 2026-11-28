import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from 'cloudflare:workers';
import { POST as account } from '../app/api/profile/route';
import { GET as readProgress, POST as progressPost } from '../app/api/profile/progress/route';
import { GET as roomGet, POST as roomPost } from '../app/api/rooms/[code]/route';
import { POST as createRoute } from '../app/api/rooms/route';
import { CreateRoomResponse, ProgressResponse } from '../lib/contract';
import { achievements, award, type Achievement } from '../lib/server/achievements';
import { newRoom, type Room } from '../lib/server/session';
import { cookieFrom, get, json, post } from './api-helpers';
import { useDatabase } from './database';
import { fakeRooms } from './durable';

// A real date: sign-up refuses a birth date after the clock.
const T0 = Date.UTC(2026, 10, 28, 12);
const bindings = env as { ROOMS?: unknown; ROOM_HOST?: string };
let sqlite: ReturnType<typeof useDatabase>;
beforeEach(() => {
  sqlite = useDatabase();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  achievements.length = 0;
  delete bindings.ROOMS;
  delete bindings.ROOM_HOST;
});

// The list is #83's to write; these stand in for it.
const lastStanding: Achievement = {
  id: 'last-standing',
  game: 'storm',
  earned: (r, id) => r.players.length === 1 && r.players[0].id === id,
};
const everyone = (game: Room['game']): Achievement => ({ id: 'played-' + game, game, earned: () => true });

async function signUp(name: string) {
  const res = await account(
    post('/api/profile', { action: 'register', name, password: 'correct horse', birthday: '1990-05-17' }),
  );
  return { cookie: cookieFrom(res), id: (await json(res)).profile.id as string };
}
const ctx = (code: string) => ({ params: Promise.resolve({ code }) });
const bearer = (token: string) => ({ authorization: 'Bearer ' + token });
const send = async (code: string, body: Record<string, unknown>, token = '', cookie = '') =>
  json(
    await roomPost(
      post('/api/rooms/' + code, body, { ...bearer(token), ...(cookie ? { cookie } : {}) }),
      ctx(code),
    ),
  );
const progressOf = async (cookie: string) =>
  ProgressResponse.parse(await json(await readProgress(get('/api/profile/progress', { cookie }))));

// Ana is signed in, Leo is a guest. Leo's phone goes quiet and the host removes him, which ends Storm Deck.
async function stormEndedByLeaving() {
  const ana = await signUp('Ana');
  const created = CreateRoomResponse.parse(
    await json(await createRoute(post('/api/rooms', { game: 'storm' }))),
  );
  const { code, hostToken } = created;
  const anaSeat = await send(code, { action: 'join', color: '#69dafa' }, '', ana.cookie);
  const leo = await send(code, { action: 'join', name: 'Leo' });
  await send(code, { action: 'ready', ready: true }, anaSeat.playerToken);
  await send(code, { action: 'ready', ready: true }, leo.playerToken);
  await send(code, { action: 'start' }, hostToken);
  vi.setSystemTime(T0 + 30_000);
  await roomGet(get('/api/rooms/' + code, bearer(anaSeat.playerToken)), ctx(code));
  const after = await send(code, { action: 'kick', playerId: leo.playerId }, hostToken);
  return { ana, code, hostToken, phase: after.room.phase as string };
}

describe.each([
  ['D1', () => {}],
  [
    'Durable Objects',
    () => {
      bindings.ROOMS = fakeRooms();
      bindings.ROOM_HOST = 'durable';
    },
  ],
])('achievements, rooms in %s', (_, setup) => {
  beforeEach(setup);

  it('are saved for the signed-in player when the match ends, and read back by that profile only', async () => {
    achievements.push(lastStanding);
    const { ana, phase } = await stormEndedByLeaving();
    expect(phase).toBe('results');
    expect((await progressOf(ana.cookie)).achievements).toEqual([
      { id: 'last-standing', game: 'storm', earnedAt: T0 + 30_000 },
    ]);
    const someoneElse = await signUp('Bo');
    expect((await progressOf(someoneElse.cookie)).achievements).toEqual([]);
  });
});

describe('judging achievements', () => {
  function ended(game: Room['game']) {
    const r = newRoom('ABCD', { game });
    const seat = (id: string, more: Partial<Room['players'][number]> = {}) => ({
      id,
      token: id,
      name: id,
      avatar: '🎮',
      color: '#ffffff',
      ready: true,
      lastSeen: T0,
      score: 0,
      answered: false,
      ...more,
    });
    r.players = [seat('ana', { profileId: 'profile-ana' }), seat('leo'), seat('bot', { bot: true })];
    r.phase = 'results';
    return r;
  }

  it("gives nothing saved to guests and bots, and only uses the ended game's achievements", async () => {
    sqlite.exec("INSERT INTO profiles VALUES ('profile-ana','Ana','1990-05-17','🦊','salt','hash')");
    achievements.push(everyone('quiz'), everyone('storm'));
    await award(ended('quiz'), T0);
    expect(sqlite.prepare('SELECT profile_id, achievement_id, game FROM achievements').all()).toEqual([
      { profile_id: 'profile-ana', achievement_id: 'played-quiz', game: 'quiz' },
    ]);
  });

  it('keeps the first date of an achievement earned again', async () => {
    sqlite.exec("INSERT INTO profiles VALUES ('profile-ana','Ana','1990-05-17','🦊','salt','hash')");
    achievements.push(everyone('quiz'));
    await award(ended('quiz'), T0);
    await award(ended('quiz'), T0 + 60_000);
    expect(sqlite.prepare('SELECT earned_at FROM achievements').all()).toEqual([{ earned_at: T0 }]);
  });

  it('never lets a broken achievement stop the game', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    achievements.push({
      id: 'broken',
      game: 'quiz',
      earned: () => {
        throw new Error('no such field');
      },
    });
    await expect(award(ended('quiz'), T0)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith('Saving achievements failed', 'no such field');
  });
});

describe('favourites', () => {
  const favourite = (game: string, on: boolean, cookie: string, headers: Record<string, string> = {}) =>
    progressPost(
      post('/api/profile/progress', { action: 'favourite', game, favourite: on }, { cookie, ...headers }),
    );

  it('are added and removed for the signed-in profile', async () => {
    const ana = await signUp('Ana');
    await favourite('storm', true, ana.cookie);
    await favourite('quiz', true, ana.cookie);
    await favourite('quiz', true, ana.cookie);
    expect((await progressOf(ana.cookie)).favourites).toEqual(['quiz', 'storm']);
    const res = await favourite('storm', false, ana.cookie);
    expect(ProgressResponse.parse(await json(res)).favourites).toEqual(['quiz']);
    expect((await progressOf((await signUp('Bo')).cookie)).favourites).toEqual([]);
  });

  it('need a signed-in profile, a known game, and a request from the site itself', async () => {
    const ana = await signUp('Ana');
    expect((await readProgress(get('/api/profile/progress'))).status).toBe(401);
    expect((await favourite('quiz', true, '')).status).toBe(401);
    expect((await favourite('chess', true, ana.cookie)).status).toBe(400);
    expect((await favourite('quiz', true, ana.cookie, { origin: 'https://evil.example' })).status).toBe(403);
  });

  it('go with the account, achievements included', async () => {
    achievements.push(lastStanding);
    const { ana } = await stormEndedByLeaving();
    await favourite('storm', true, ana.cookie);
    await account(
      post('/api/profile', { action: 'deleteAccount', password: 'correct horse' }, { cookie: ana.cookie }),
    );
    expect(sqlite.prepare('SELECT * FROM achievements').all()).toEqual([]);
    expect(sqlite.prepare('SELECT * FROM favourites').all()).toEqual([]);
  });
});
