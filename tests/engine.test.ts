import { describe, expect, it } from 'vitest';
import { gameIds, RoomSnapshot } from '../lib/contract';
import {
  clearMatch,
  leaveMatch,
  playMatch,
  startMatch,
  tickMatch,
  viewMatch,
  type GameModule,
  type MatchRoom,
} from '../lib/server/engine';
import { modules } from '../lib/server/modules';
import { T0 } from './helpers';

// A small game for the engine alone: players take turns adding one to their count, and three wins.
type Count = { order: string[]; turn: string; counts: Record<string, number> };
const next = (s: Count) => s.order[(s.order.indexOf(s.turn) + 1) % s.order.length];
const counting: GameModule<Count, { turn: string; mine?: number }> = {
  // Any game id: it only names the game in errors.
  game: 'quiz',
  action: 'count',
  key: 'count',
  turnMs: 10_000,
  start: (players) => ({
    order: players,
    turn: players[0],
    counts: Object.fromEntries(players.map((id) => [id, 0])),
  }),
  move(s, id) {
    if (s.turn !== id) throw new Error('Wait for your turn.');
    s.counts[id]++;
    s.turn = next(s);
  },
  timeout(s) {
    s.turn = next(s);
  },
  turn: (s) => s.turn,
  leave(s, id) {
    if (s.turn === id) s.turn = next(s);
    s.order = s.order.filter((other) => other !== id);
  },
  over: (s) => s.order.length < 2 || Object.values(s.counts).some((n) => n >= 3),
  score: (s, id) => s.counts[id] ?? 0,
  view: (s, viewer) => ({ turn: s.turn, mine: viewer.id ? s.counts[viewer.id] : undefined }),
};
const at = (now = T0) => ({ now, connected: [] });

function setup(players = ['a', 'b', 'c']) {
  const room: MatchRoom & { count?: Count } = {
    phase: 'playing',
    deadline: 0,
    players: players.map((id) => ({ id, score: 0 })),
  };
  startMatch(counting, room, at());
  return { room, s: room.count! };
}

describe('Game engine', () => {
  it('starts the turn clock and restarts it on every move', () => {
    const { room, s } = setup();
    expect(room.deadline).toBe(T0 + 10_000);
    playMatch(counting, room, 'a', {}, at(T0 + 4000));
    expect(s.turn).toBe('b');
    expect(room.deadline).toBe(T0 + 14_000);
  });

  it('plays for a player once their time is up, but not while paused', () => {
    const { room, s } = setup();
    expect(tickMatch(counting, room, at(T0 + 9_999))).toBe(false);
    expect(s.turn).toBe('a');
    expect(tickMatch(counting, room, at(T0 + 10_000))).toBe(true);
    expect(s.turn).toBe('b');
    expect(room.deadline).toBe(T0 + 20_000);
    room.phase = 'paused';
    expect(tickMatch(counting, room, at(T0 + 99_000))).toBe(false);
  });

  it('never plays for anyone in a game without a turn clock', () => {
    const untimed = { ...counting, turnMs: undefined };
    const room: MatchRoom & { count?: Count } = { phase: 'playing', deadline: 0, players: [] };
    startMatch(untimed, room, at());
    expect(room.deadline).toBe(0);
    expect(tickMatch(untimed, room, at(T0 + 99_000))).toBe(false);
  });

  it('forgets the match when the room goes back to the lobby', () => {
    const { room } = setup();
    clearMatch(counting, room);
    expect(room.count).toBeUndefined();
  });

  it('restarts the clock only when the player who left had the turn', () => {
    const { room, s } = setup(['a', 'b', 'c', 'd']);
    leaveMatch(counting, room, 'c', at(T0 + 3000));
    expect(room.deadline).toBe(T0 + 10_000);
    leaveMatch(counting, room, 'a', at(T0 + 5000));
    expect(s.turn).toBe('b');
    expect(room.deadline).toBe(T0 + 15_000);
  });

  it('ends with the final scores and stops the clock', () => {
    const { room } = setup(['a', 'b']);
    for (const id of ['a', 'b', 'a', 'b', 'a']) playMatch(counting, room, id, {}, at());
    expect(room.phase).toBe('results');
    expect(room.deadline).toBe(0);
    expect(room.players.map((p) => p.score)).toEqual([3, 2]);
  });

  it('refuses moves when no match is running', () => {
    const { room } = setup();
    room.phase = 'paused';
    expect(() => playMatch(counting, room, 'a', {}, at())).toThrow('Quiz Volt is not active.');
    delete room.count;
    room.phase = 'playing';
    expect(() => playMatch(counting, room, 'a', {}, at())).toThrow('is not active');
    expect(viewMatch(counting, room, { host: true })).toBeUndefined();
  });

  it('shows each viewer only what the game lets them see', () => {
    const { room } = setup();
    playMatch(counting, room, 'a', {}, at());
    expect(viewMatch(counting, room, { id: 'a', host: false })).toEqual({ turn: 'b', mine: 1 });
    expect(viewMatch(counting, room, { host: true })).toEqual({ turn: 'b', mine: undefined });
  });
});

describe('Games on the engine', () => {
  it('are games the contract knows, shown under a snapshot field', () => {
    for (const m of modules) {
      expect(gameIds).toContain(m.game);
      expect(Object.keys(RoomSnapshot.shape)).toContain(m.key);
    }
  });
});
