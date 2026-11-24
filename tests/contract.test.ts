import { beforeEach, describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { GET as afterHours } from '../app/api/after-hours/route';
import { GET as whoAmI, POST as account } from '../app/api/profile/route';
import { GET as roomRoute, POST as roomPost } from '../app/api/rooms/[code]/route';
import { POST as createRoute } from '../app/api/rooms/route';
import {
  AfterHoursResponse,
  CreateRoomRequest,
  CreateRoomResponse,
  ErrorResponse,
  ProfileRequest,
  ProfileResponse,
  RoomCommand,
  RoomResponse,
  RoomSnapshot,
} from '../lib/contract';
import { snapshot } from '../lib/server/session';
import { cookieFrom, get, json, post } from './api-helpers';
import { useDatabase } from './database';
import { T0, table } from './helpers';

beforeEach(() => {
  useDatabase();
});

const fits = (schema: z.ZodTypeAny, value: unknown) => {
  const result = schema.safeParse(value);
  expect(result.error?.issues ?? [], JSON.stringify(value).slice(0, 300)).toEqual([]);
};

describe('what the screens send is accepted', () => {
  const player = [
    { action: 'join', name: 'Ana', avatar: '🦊', color: '#c3f76a' },
    { action: 'ready', ready: true },
    { action: 'input', round: 2, value: 3 },
    { action: 'input', round: 2, early: true },
    { action: 'input', round: 2, reactionMs: 231.5 },
    { action: 'drive', steering: -0.5, accelerate: 1, brake: 0, powerUp: false, drift: true },
    { action: 'island', move: 'roll', revision: 4 },
    { action: 'island', move: 'place', revision: 4, piece: 'road', index: 12 },
    { action: 'island', move: 'discard', revision: 4, cards: ['ore', 'ore', 'wool'] },
    { action: 'island', move: 'robber', revision: 4, index: 7 },
    { action: 'island', move: 'steal', revision: 4, target: 'someone' },
    { action: 'island', move: 'harvest', revision: 4, resource: 'grain' },
    { action: 'island', move: 'offer', revision: 4, give: 'ore', want: 'wool' },
    { action: 'island', move: 'bank', revision: 4, give: 'ore', want: 'wool' },
    { action: 'island', move: 'accept', revision: 4 },
    { action: 'island', move: 'end', revision: 4 },
    { action: 'view' },
  ];
  const host = [
    ...['addBot', 'start', 'restart', 'pause', 'resume', 'lobby', 'end', 'view'].map((action) => ({
      action,
    })),
    { action: 'configure', game: 'turbo' },
    { action: 'configure', rounds: 7 },
    { action: 'kick', playerId: 'abc' },
    { action: 'standIn', playerId: 'abc' },
  ];
  it.each([...player, ...host])('room command %j', (command) => fits(RoomCommand, command));
  it.each([{}, { game: 'quiz' }, { game: 'settlers', rounds: 10 }])('create request %j', (body) =>
    fits(CreateRoomRequest, body),
  );
  it.each([
    { action: 'register', name: 'Sam', password: 'correct horse', birthday: '1990-05-17', avatar: '🐼' },
    { action: 'login', name: 'Sam', password: 'correct horse' },
    { action: 'logout' },
    { action: 'logoutAll' },
    { action: 'changePassword', password: 'correct horse', newPassword: 'another one' },
    { action: 'deleteAccount', password: 'correct horse' },
  ])('profile request %j', (body) => fits(ProfileRequest, body));
});

describe('malformed requests are refused with the field named', () => {
  const room = async () => {
    const created = await json(await createRoute(post('/api/rooms', {})));
    const send = async (body: unknown) => {
      const response = await roomPost(
        post('/api/rooms/' + created.code, body, { authorization: 'Bearer x' }),
        {
          params: Promise.resolve({ code: created.code }),
        },
      );
      return { status: response.status, error: (await json(response)).error as string };
    };
    return send;
  };
  it.each([
    ['no action', {}, /Invalid request/],
    ['an unknown action', { action: 'explode' }, /Invalid request: action/],
    [
      'steering as text',
      { action: 'drive', steering: 'left', accelerate: 1, brake: 0, powerUp: false },
      /steering/,
    ],
    [
      'steering out of range',
      { action: 'drive', steering: 5, accelerate: 1, brake: 0, powerUp: false },
      /steering/,
    ],
    ['a missing round', { action: 'input', value: 1 }, /round/],
    ['a kick without a player', { action: 'kick' }, /playerId/],
    [
      'cards that are not resources',
      { action: 'island', move: 'discard', revision: 1, cards: ['gold'] },
      /cards/,
    ],
    ['ready as text', { action: 'ready', ready: 'yes' }, /ready/],
    ['an unknown game', { action: 'configure', game: 'chess' }, /game/],
  ])('%s', async (_label, body, message) => {
    const result = await (await room())(body);
    expect(result.status).toBe(400);
    expect(result.error).toMatch(message);
    fits(ErrorResponse, { error: result.error });
  });
  it('refuses a room created with an unknown game or too many rounds', async () => {
    for (const body of [{ game: 'chess' }, { rounds: 99 }, { rounds: 'many' }]) {
      const response = await createRoute(post('/api/rooms', body));
      expect(response.status).toBe(400);
      fits(ErrorResponse, await response.json());
    }
  });
});

describe('what the server sends fits the contract', () => {
  it('for creating, joining and viewing a room', async () => {
    const created = await createRoute(post('/api/rooms', { game: 'settlers' }));
    const body = await json(created);
    fits(CreateRoomResponse, body);
    const ctx = { params: Promise.resolve({ code: body.code }) };
    const joined = await json(
      await roomPost(post('/api/rooms/' + body.code, { action: 'join', name: 'Ana' }), ctx),
    );
    fits(RoomResponse, joined);
    expect(joined.playerId && joined.playerToken).toBeTruthy();
    const seen = await roomRoute(
      get('/api/rooms/' + body.code, { authorization: 'Bearer ' + body.hostToken }),
      ctx,
    );
    fits(RoomResponse, await seen.json());
  });

  it.each([
    ['a quiz in every phase', 'quiz'],
    ['a reaction duel in every phase', 'reaction'],
  ] as const)('%s', (_label, game) => {
    const { room, host, play } = table(game, 2, 1);
    fits(RoomSnapshot, snapshot(room, T0));
    host({ action: 'start' });
    fits(RoomSnapshot, snapshot(room, T0));
    play(
      0,
      game === 'quiz'
        ? { action: 'input', round: 1, value: room.deck[0].correct }
        : { action: 'input', round: 1, early: true },
    );
    play(
      1,
      game === 'quiz' ? { action: 'input', round: 1, value: 0 } : { action: 'input', round: 1, early: true },
    );
    fits(RoomSnapshot, snapshot(room, T0)); // revealing
    host({ action: 'pause' }, T0 + 10);
    fits(RoomSnapshot, snapshot(room, T0 + 20)); // paused
    host({ action: 'resume' }, T0 + 30);
    host({ action: 'view' }, room.deadline + 1);
    expect(room.phase).toBe('results');
    fits(RoomSnapshot, snapshot(room, room.deadline + 1));
  });

  it('for a race, with cars on the track', () => {
    const { room, host, play } = table('turbo', 3);
    host({ action: 'start' });
    for (let i = 0; i < 3; i++)
      play(i, { action: 'drive', steering: 0.3, accelerate: 1, brake: 0, powerUp: false, drift: true }, T0);
    host({ action: 'view' }, T0 + 4000);
    const view = snapshot(room, T0 + 4000);
    expect(view.racers).toHaveLength(3);
    expect(view.pads.length + view.hazards.length).toBeGreaterThan(0);
    fits(RoomSnapshot, view);
  });

  it('for an island match, for each viewer', () => {
    const { room, host, seats, play } = table('settlers', 2);
    host({ action: 'addBot' });
    fits(RoomSnapshot, snapshot(room, T0));
    host({ action: 'start' });
    fits(RoomSnapshot, snapshot(room, T0));
    room.island!.phase = 'settlement';
    const first = room.island!.order[0];
    const seat = seats.findIndex((s) => s.id === first);
    const board = snapshot(room, T0, seats[seat].token);
    fits(RoomSnapshot, board);
    expect(board.island?.hand).toBeDefined();
    expect(snapshot(room, T0, room.hostToken).island?.hand).toBeUndefined();
    play(seat, { action: 'island', move: 'place', piece: 'settlement', index: 0, revision: 0 });
    room.island!.offer = { give: 'ore', want: 'wool' };
    room.island!.owed = { [seats[0].id]: 2 };
    room.island!.victims = [seats[1].id];
    fits(RoomSnapshot, snapshot(room, T0, seats[0].token));
  });

  it('for profiles, sign-in, sign-out and the 18+ shelf', async () => {
    const adult = await account(
      post('/api/profile', {
        action: 'register',
        name: 'Sam',
        password: 'correct horse',
        birthday: '1990-05-17',
      }),
    );
    fits(ProfileResponse, await adult.json());
    const cookie = cookieFrom(adult);
    fits(ProfileResponse, await (await whoAmI(get('/api/profile', { cookie }))).json());
    fits(ProfileResponse, await (await whoAmI(get('/api/profile'))).json());
    const shelf = await afterHours(get('/api/after-hours', { cookie }));
    expect(shelf.status).toBe(200);
    fits(AfterHoursResponse, await shelf.json());
    const refused = await afterHours(get('/api/after-hours'));
    expect(refused.status).toBe(403);
    fits(ErrorResponse, await refused.json());
    const wrong = await account(
      post('/api/profile', { action: 'login', name: 'Sam', password: 'wrong password' }),
    );
    expect(wrong.status).toBe(401);
    fits(ErrorResponse, await wrong.json());
    const out = await account(post('/api/profile', { action: 'logout' }, { cookie }));
    fits(ProfileResponse, await out.json());
  });
});

describe('the contract itself', () => {
  it('refuses a response with a field it does not describe', () => {
    const { room } = table('quiz', 1);
    expect(RoomSnapshot.safeParse({ ...snapshot(room, T0), hostToken: 'leak' }).success).toBe(false);
    expect(RoomSnapshot.safeParse({ ...snapshot(room, T0), players: [{ token: 'leak' }] }).success).toBe(
      false,
    );
  });
  it('refuses a response with a field of the wrong type', () => {
    const { room } = table('quiz', 1);
    expect(RoomSnapshot.safeParse({ ...snapshot(room, T0), round: '1' }).success).toBe(false);
  });
});
