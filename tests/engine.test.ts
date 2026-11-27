import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameIds, RoomSnapshot, type Difficulty } from '../lib/contract';
import {
  botDelayMs,
  clearMatch,
  hostMatch,
  matchWakes,
  leaveMatch,
  playMatch,
  playsWith,
  resumeMatch,
  startMatch,
  tickMatch,
  viewMatch,
  type GameModule,
  type MatchRoom,
} from '../lib/server/engine';
import { modules } from '../lib/server/modules';
import { T0 } from './helpers';

afterEach(() => vi.restoreAllMocks());

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
  move(s, id, command) {
    if (s.turn !== id) throw new Error('Wait for your turn.');
    if (command.bad) throw new Error('Not a move.');
    s.counts[id]++;
    s.turn = next(s);
  },
  timeout(s) {
    s.turn = next(s);
  },
  turn: (s) => s.turn,
  bot: () => ({}),
  leave(s, id) {
    if (s.turn === id) s.turn = next(s);
    s.order = s.order.filter((other) => other !== id);
  },
  over: (s) => s.order.length < 2 || Object.values(s.counts).some((n) => n >= 3),
  score: (s, id) => s.counts[id] ?? 0,
  view: (s, viewer) => ({ turn: s.turn, mine: viewer.id ? s.counts[viewer.id] : undefined }),
};
const at = (now = T0, bots: Record<string, Difficulty> = {}) => ({ now, connected: [], bots });

function setup(players = ['a', 'b', 'c']) {
  const room: MatchRoom & { count?: Count } = {
    phase: 'playing',
    started: 0,
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
    const room: MatchRoom & { count?: Count } = { phase: 'playing', started: 0, deadline: 0, players: [] };
    startMatch(untimed, room, at());
    expect(room.deadline).toBe(0);
    expect(tickMatch(untimed, room, at(T0 + 99_000))).toBe(false);
  });

  it("plays a bot's turn once it has waited a moment, and never a human's", () => {
    const { room, s } = setup();
    const bots = { b: 'hard' as const };
    expect(tickMatch(counting, room, at(T0 + botDelayMs, bots))).toBe(false);
    playMatch(counting, room, 'a', {}, at(T0 + 2000, bots));
    expect(tickMatch(counting, room, at(T0 + 2000 + botDelayMs - 1, bots))).toBe(false);
    expect(tickMatch(counting, room, at(T0 + 2000 + botDelayMs, bots))).toBe(true);
    expect(s.counts.b).toBe(1);
    expect(s.turn).toBe('c');
    expect(room.deadline).toBe(T0 + 2000 + botDelayMs + 10_000);
  });

  it('plays as if out of time when a bot sends a move the game refuses, and logs it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { room, s } = setup();
    const confused = { ...counting, bot: () => ({ bad: true }) };
    expect(tickMatch(confused, room, at(T0 + botDelayMs, { a: 'easy' }))).toBe(true);
    expect(s.counts.a).toBe(0);
    expect(s.turn).toBe('b');
    expect(warn).toHaveBeenCalledWith('Quiz Volt refused a bot move:', new Error('Not a move.'));
  });

  it('times bots from the start of the turn in a game without a turn clock', () => {
    const untimed = { ...counting, turnMs: undefined };
    const room: MatchRoom & { count?: Count } = { phase: 'playing', started: 0, deadline: 0, players: [] };
    startMatch(untimed, room, at());
    room.count = { order: ['a', 'b'], turn: 'a', counts: { a: 0, b: 0 } };
    expect(tickMatch(untimed, room, at(T0 + botDelayMs - 1, { a: 'normal' }))).toBe(false);
    expect(tickMatch(untimed, room, at(T0 + botDelayMs, { a: 'normal' }))).toBe(true);
    expect(room.count.turn).toBe('b');
    expect(room.started).toBe(T0 + botDelayMs);
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

describe('Game engine options', () => {
  // A host turns the rounds on; players score with either of two commands.
  type Rounds = { round: number; points: Record<string, number> };
  const rounds: GameModule<Rounds, Rounds> = {
    game: 'pyramid',
    action: ['plus', 'double'],
    key: 'rounds',
    liveScores: true,
    start: () => ({ round: 0, points: {} }),
    move(s, id, command) {
      const now = s.points[id] ?? 0;
      s.points[id] = command.action === 'double' ? Math.max(1, now * 2) : now + 1;
    },
    host: { action: 'next', move: (s) => void s.round++ },
    leave() {},
    over: (s) => s.round === 2,
    score: (s, id) => s.points[id] ?? 0,
    view: (s) => s,
  };
  function setup() {
    const room: MatchRoom & { rounds?: Rounds } = {
      phase: 'playing',
      started: 0,
      deadline: 0,
      players: [
        { id: 'a', score: 0 },
        { id: 'b', score: 0 },
      ],
    };
    startMatch(rounds, room, at());
    return room;
  }

  it("takes any of a game's commands, and shows the scores after every move", () => {
    const room = setup();
    expect(playsWith(rounds, 'plus') && playsWith(rounds, 'double') && !playsWith(rounds, 'next')).toBe(true);
    playMatch(rounds, room, 'a', { action: 'plus' }, at());
    playMatch(rounds, room, 'a', { action: 'double' }, at());
    expect(room.players.map((p) => p.score)).toEqual([2, 0]);
    expect(room.phase).toBe('playing');
  });

  it("lets the host move the match on, and ends it like a player's move would", () => {
    const room = setup();
    hostMatch(rounds, room, { action: 'next' }, at());
    expect(room.rounds!.round).toBe(1);
    hostMatch(rounds, room, { action: 'next' }, at());
    expect(room.phase).toBe('results');
    expect(() => hostMatch(rounds, room, { action: 'next' }, at())).toThrow('Pyramid is not active.');
  });
});

describe('Game engine clocks of its own', () => {
  // A fuse burns out at a set time, with no turn clock; pausing pushes it back.
  type Fuse = { at: number; burnt: boolean };
  const fuse: GameModule<Fuse, Fuse> = {
    game: 'kings',
    action: 'light',
    key: 'fuse',
    start: (_, ctx) => ({ at: ctx.now + 3000, burnt: false }),
    move() {},
    wake: (s) => (s.burnt ? 0 : s.at),
    tick(s, ctx) {
      if (s.burnt || ctx.now < s.at) return false;
      s.burnt = true;
      return true;
    },
    resume: (s, ms) => void (s.at += ms),
    leave() {},
    over: (s) => s.burnt,
    score: () => 0,
    view: (s) => s,
  };

  it("wakes at the game's own moment, acts then, and moves that moment on after a pause", () => {
    const room: MatchRoom & { fuse?: Fuse } = { phase: 'playing', started: 0, deadline: 0, players: [] };
    startMatch(fuse, room, at());
    expect(matchWakes(fuse, room, at())).toContain(T0 + 3000);
    expect(tickMatch(fuse, room, at(T0 + 2999))).toBe(false);
    resumeMatch(fuse, room, 1000);
    expect(tickMatch(fuse, room, at(T0 + 3999))).toBe(false);
    expect(tickMatch(fuse, room, at(T0 + 4000))).toBe(true);
    expect(room.phase).toBe('results');
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
