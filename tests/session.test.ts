import { afterEach, describe, expect, it, vi } from 'vitest';
import { mutate, newRoom, snapshot } from '../lib/server/session';
import { DROP, T0, table } from './helpers';

afterEach(() => vi.restoreAllMocks());

describe('lobby', () => {
  it('rejects unknown games and round counts', () => {
    expect(() => newRoom('TEST', { game: 'chess' })).toThrow('available game');
    expect(() => newRoom('TEST', { rounds: 11 })).toThrow('between 1 and 10');
  });
  it('rejects duplicate nicknames, ignoring case', () => {
    const { room } = table('quiz', 1);
    expect(() => mutate(room, { action: 'join', name: 'p0' }, '', T0)).toThrow('already in the room');
  });
  it('rejects players beyond the limit', () => {
    const { room } = table('turbo', 4);
    expect(() => mutate(room, { action: 'join', name: 'Extra' }, '', T0)).toThrow('full');
  });
  it('starts only when everyone is ready', () => {
    const { host, play } = table('quiz', 2);
    play(1, { action: 'ready', ready: false });
    expect(() => host({ action: 'start' })).toThrow('connected and ready');
  });
  it('needs two seats for Island Settlers and lets a bot fill one', () => {
    const { room, host } = table('settlers', 1);
    expect(() => host({ action: 'start' })).toThrow('two to four');
    host({ action: 'addBot' });
    host({ action: 'start' });
    expect(room.phase).toBe('playing');
  });
});

describe('permissions and privacy', () => {
  it('keeps host actions from players and strangers', () => {
    const { room, play } = table('quiz', 1);
    expect(() => play(0, { action: 'start' })).toThrow('requires the host');
    expect(() => mutate(room, { action: 'view' }, 'wrong', T0)).toThrow('Join this room');
    expect(() => mutate(room, { action: 'view' }, '', T0)).toThrow('Join this room');
  });
  it('never exposes tokens, quiz answers or other hands', () => {
    const quiz = table('quiz', 1);
    quiz.host({ action: 'start' });
    expect(snapshot(quiz.room, T0).correct).toBeNull();
    expect(snapshot(quiz.room, T0).question).not.toHaveProperty('correct');
    const island = table('settlers', 2);
    island.host({ action: 'start' });
    const view = snapshot(island.room, T0, island.seats[0].token);
    expect(view.island).not.toHaveProperty('hands');
    expect(view.island!.hand).toBeDefined();
    const [me, other] = island.room.players;
    island.room.island!.hands[me.id].ore = 2;
    island.room.island!.hands[other.id].wool = 3;
    for (const token of ['', island.seats[0].token])
      expect(snapshot(island.room, T0, token).island!.handSizes).toEqual({ [me.id]: 2, [other.id]: 3 });
    expect(snapshot(island.room, T0).island!.hand).toBeUndefined();
    island.room.island!.dev = {
      [me.id]: [{ kind: 'knight', fresh: true }],
      [other.id]: [{ kind: 'victory', fresh: false }],
    };
    const mine = snapshot(island.room, T0, island.seats[0].token).island!;
    expect(mine.devHand).toEqual([{ kind: 'knight', fresh: true }]);
    expect(mine.devSizes).toEqual({ [me.id]: 1, [other.id]: 1 });
    for (const seen of [mine, snapshot(island.room, T0).island!]) {
      expect(seen).not.toHaveProperty('deck');
      expect(seen).not.toHaveProperty('dev');
      expect(seen.deckLeft).toBe(25);
      expect(JSON.stringify(seen)).not.toContain('victory');
    }
    const json = JSON.stringify(view);
    for (const secret of [island.room.hostToken, ...island.seats.map((s) => s.token)])
      expect(json).not.toContain(secret);
  });
});

describe('quiz', () => {
  it('scores fast correct answers higher, wrong ones zero, and reveals when all answered', () => {
    const { room, host, play } = table('quiz', 3);
    host({ action: 'start' });
    const correct = room.deck[0].correct;
    play(0, { action: 'input', round: 1, value: correct }, T0);
    play(1, { action: 'input', round: 1, value: correct }, T0 + 7500);
    expect(room.revealing).toBe(false);
    play(2, { action: 'input', round: 1, value: (correct + 1) % 4 }, T0 + 8000);
    expect(room.players.map((p) => p.score)).toEqual([1000, 750, 0]);
    expect(room.revealing).toBe(true);
    expect(snapshot(room, T0 + 8000).correct).toBe(correct);
  });
  it('counts only the first answer and rejects stale rounds', () => {
    const { room, host, play } = table('quiz', 2);
    host({ action: 'start' });
    const correct = room.deck[0].correct;
    play(0, { action: 'input', round: 1, value: (correct + 1) % 4 });
    play(0, { action: 'input', round: 1, value: correct });
    expect(room.players[0].score).toBe(0);
    expect(() => play(1, { action: 'input', round: 2, value: 0 })).toThrow('closed');
  });
  it('moves through reveal, next round and results on time', () => {
    const { room, host } = table('quiz', 1);
    host({ action: 'start' });
    let now = T0;
    for (const expected of ['reveal', 'round', 'reveal', 'results']) {
      now = room.deadline;
      host({ action: 'view' }, now);
      expect(room.phase === 'results' ? 'results' : room.revealing ? 'reveal' : 'round').toBe(expected);
    }
  });
  it('freezes the clock while paused', () => {
    const { room, host, play } = table('quiz', 1);
    host({ action: 'start' });
    const deadline = room.deadline;
    host({ action: 'pause' }, T0 + 1000);
    expect(() => play(0, { action: 'input', round: 1, value: 0 }, T0 + 2000)).toThrow('closed');
    host({ action: 'resume' }, T0 + 61_000);
    expect(room.deadline).toBe(deadline + 60_000);
  });
});

describe('reaction', () => {
  function duel(count = 2) {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const t = table('reaction', count);
    t.host({ action: 'start' });
    return { ...t, signal: t.room.signalAt };
  }
  it('hides the signal until shortly before it fires', () => {
    const { room, signal } = duel();
    expect(snapshot(room, signal - 801).signalAt).toBeNull();
    expect(snapshot(room, signal - 800).signalAt).toBe(signal);
  });
  it('uses the time the phone measured', () => {
    const { room, play, signal } = duel();
    play(0, { action: 'input', round: 1, reactionMs: 250 }, signal + 600);
    expect(room.players[0]).toMatchObject({ reactionMs: 250, score: 950 });
  });
  it.each([
    ['reported by the phone', 0, { early: true }],
    ['received before the signal', -1, { reactionMs: 200 }],
    ['too fast to be human', 300, { reactionMs: 79 }],
  ])('scores zero for an early tap: %s', (_label, offset, tap) => {
    const { room, play, signal } = duel();
    play(0, { action: 'input', round: 1, ...tap }, signal + offset);
    expect(room.players[0]).toMatchObject({ early: true, score: 0, answered: true });
  });
  it('limits how much of a late tap counts as network delay', () => {
    const { room, play, signal } = duel();
    play(0, { action: 'input', round: 1, reactionMs: 100 }, signal + 2500);
    expect(room.players[0].reactionMs).toBe(1000);
  });
  it.each([undefined, '200', NaN, Infinity])('rejects a reaction time of %s', (value) => {
    const { play, signal } = duel();
    expect(() => play(0, { action: 'input', round: 1, reactionMs: value }, signal + 300)).toThrow(
      'Invalid reaction',
    );
  });
  it('picks a fresh signal after a pause', () => {
    const { room, host, signal } = duel();
    host({ action: 'pause' }, signal - 100);
    host({ action: 'resume' }, signal + 5000);
    expect(room.signalAt).toBe(signal + 5000 + 3500);
  });
});

describe('dropped players', () => {
  it('can rejoin mid-match by nickname, keeping seat and score', () => {
    const { room, host, ping, seats } = table('quiz', 2);
    host({ action: 'start' });
    room.players[1].score = 700;
    ping(0, T0 + DROP);
    const { extras } = mutate(room, { action: 'join', name: ' p1 ' }, '', T0 + DROP);
    expect(extras.playerId).toBe(seats[1].id);
    expect(room.players[1].score).toBe(700);
    expect(() => mutate(room, { action: 'view' }, seats[1].token, T0 + DROP)).toThrow('Join this room');
    mutate(room, { action: 'view' }, extras.playerToken, T0 + DROP);
  });
  it('cannot have their seat taken while connected', () => {
    const { room, host } = table('quiz', 2);
    host({ action: 'start' });
    expect(() => mutate(room, { action: 'join', name: 'P1' }, '', T0)).toThrow('no longer accepting');
  });
  it('can be removed mid-round, which reveals once the rest have answered', () => {
    const { room, host, play, ping, seats } = table('reaction', 2);
    host({ action: 'start' });
    play(0, { action: 'input', round: 1, early: true });
    expect(() => host({ action: 'kick', playerId: seats[1].id })).toThrow('disconnected');
    // Stay within the round by making the second player look long gone.
    room.players[1].lastSeen = T0 - DROP;
    host({ action: 'kick', playerId: seats[1].id });
    expect(room.players).toHaveLength(1);
    expect(room.revealing).toBe(true);
    ping(0, T0);
  });
  it('send the room back to the lobby when the last one is removed', () => {
    const { room, host, seats } = table('turbo', 1);
    host({ action: 'start' });
    host({ action: 'kick', playerId: seats[0].id }, T0 + DROP);
    expect(room.phase).toBe('lobby');
  });
  it('lose their car when removed from a race', () => {
    const { room, host, ping, seats } = table('turbo', 2);
    host({ action: 'start' });
    ping(0, T0 + DROP);
    host({ action: 'kick', playerId: seats[1].id }, T0 + DROP);
    expect(room.race!.cars.map((c) => c.id)).toEqual([seats[0].id]);
  });

  function island() {
    const t = table('settlers', 2);
    t.host({ action: 'start' });
    // Make it the second player's turn, then let them drop.
    t.room.island!.turn = 1;
    t.ping(0, T0 + DROP);
    return t;
  }
  it('get a stand-in bot that plays until they return', () => {
    const { room, host, play, seats } = island(),
      now = T0 + DROP;
    host({ action: 'view' }, now + 5000);
    expect(room.island!.revision).toBe(0);
    host({ action: 'standIn', playerId: seats[1].id }, now);
    host({ action: 'view' }, now + 1200);
    expect(room.island!.revision).toBe(1);
    play(1, { action: 'view' }, now + 1300);
    expect(room.players[1].standIn).toBeUndefined();
    host({ action: 'view' }, now + 9000);
    expect(room.island!.revision).toBe(1);
  });
  it('are not replaced while connected, and not removed from an island', () => {
    const { host, seats } = island(),
      now = T0 + DROP;
    expect(() => host({ action: 'standIn', playerId: seats[0].id }, now)).toThrow('disconnected');
    expect(() => host({ action: 'kick', playerId: seats[1].id }, now)).toThrow('bot take over');
  });
  it('do not block a rematch when a bot stands in', () => {
    const { room, host, seats } = island(),
      now = T0 + DROP;
    expect(() => host({ action: 'restart' }, now)).toThrow('connected and ready');
    host({ action: 'standIn', playerId: seats[1].id }, now);
    host({ action: 'restart' }, now);
    expect(room.phase).toBe('playing');
    host({ action: 'lobby' }, now);
    expect(room.players[1].standIn).toBeUndefined();
  });
});
