import { afterEach, describe, expect, it, vi } from 'vitest';
import type { QuizPower, QuizType } from '../lib/contract';
import { dealPowers } from '../lib/server/quiz';
import { snapshot } from '../lib/server/session';
import { findQuestions, ownQuestions, parseTrivia } from '../lib/server/trivia';
import { DROP, T0, table } from './helpers';

afterEach(() => vi.restoreAllMocks());

function quiz(count = 3, rounds = 5, type: QuizType = 'accuracy') {
  const t = table('quiz', count, rounds);
  const { room } = t;
  t.host({ action: 'start' });
  for (const q of room.quiz!.rounds) q.type = type;
  const next = () => {
    t.host({ action: 'view' }, room.deadline);
    // Phones keep polling in real matches.
    for (const p of room.players) p.lastSeen = room.started;
  };
  const until = (stage: string) => {
    while (room.quiz!.stage !== stage && room.phase === 'playing') next();
  };
  const power = (i: number, name: QuizPower | null, target?: number) =>
    t.play(
      i,
      {
        action: 'quizPower',
        round: room.round,
        power: name,
        ...(target === undefined ? {} : { target: t.seats[target].id }),
      },
      room.started,
    );
  const right = () => room.quiz!.rounds[room.round - 1].correct;
  const answer = (i: number, good: boolean, after = 0) =>
    t.play(
      i,
      { action: 'input', round: room.round, value: (right() + (good ? 0 : 1)) % 4 },
      room.started + after,
    );
  const scores = () => room.players.map((p) => p.score);
  return { ...t, next, until, power, right, answer, scores };
}

describe('quiz rounds', () => {
  it('spins a theme, offers powers, asks, builds suspense and reveals', () => {
    const { room, next } = quiz(1, 1);
    const seen = [];
    while (room.phase === 'playing') {
      seen.push(room.quiz!.stage);
      next();
    }
    expect(seen).toEqual(['intro', 'power', 'question', 'suspense', 'reveal']);
  });
  it('never repeats a theme or question in a match, or a question in a rematch', () => {
    const { room, host } = quiz(1, 10);
    // After the ten rounds come spare questions, kept for tie-breaks.
    const first = room.quiz!.rounds.slice(0, 10);
    expect(new Set(first.map((q) => q.theme)).size).toBe(10);
    host({ action: 'restart' });
    const texts = [...first, ...room.quiz!.rounds.slice(0, 10)].map((q) => q.text);
    expect(new Set(texts).size).toBe(20);
  });
  it('moves on as soon as everyone connected has acted', () => {
    const { room, until, power, answer, play } = quiz(3);
    until('power');
    room.players[2].lastSeen = room.started - DROP;
    power(0, null);
    power(1, null);
    expect(room.quiz!.stage).toBe('question');
    answer(0, true);
    expect(() => play(1, { action: 'input', round: 2, value: 0 }, room.started)).toThrow('closed');
    answer(1, false);
    expect(room.quiz!.stage).toBe('suspense');
  });
  it('keeps the answer to the TV, and to the reveal', () => {
    const { room, seats, until, answer, next, right } = quiz(2);
    until('question');
    const see = (token: string, at = room.started) => snapshot(room, at, token);
    expect(see(room.hostToken).question!.options).toEqual(['', '', '', '']);
    expect(see(seats[0].token).question!.options.every(Boolean)).toBe(true);
    answer(0, true);
    answer(1, false);
    expect(see(room.hostToken).correct).toBeNull();
    expect(see(room.hostToken).quiz!.crossed).toEqual([]);
    const late = see(room.hostToken, room.started + 3000).quiz!.crossed;
    expect(late).toHaveLength(2);
    expect(late).not.toContain(right());
    for (const p of see(seats[0].token).players) expect(p.gained).toBe(0);
    next();
    expect(see(room.hostToken)).toMatchObject({ correct: right() });
    const phone = see(seats[0].token);
    expect(phone.correct).toBeNull();
    expect(phone.question!.options).toEqual(['', '', '', '']);
    expect(phone.quiz).toMatchObject({ picks: {}, crossed: [], mine: { right: true } });
    expect(see(seats[1].token).quiz!.mine).toMatchObject({ right: false, silent: false });
    expect(see('').quiz!.mine).toBeUndefined();
  });
  it('counts only the first answer, and freezes while paused', () => {
    const { room, host, play, until, answer } = quiz(2);
    until('question');
    answer(0, false);
    answer(0, true);
    expect(room.quiz!.picks[room.players[0].id].value).not.toBe(room.quiz!.rounds[0].correct);
    const { deadline, started } = room;
    host({ action: 'pause' }, started + 1000);
    expect(() => play(1, { action: 'input', round: 1, value: 0 }, started + 2000)).toThrow('closed');
    host({ action: 'resume' }, started + 61_000);
    expect(room.deadline).toBe(deadline + 60_000);
  });
  it.each([
    ['accuracy', [1000, 1000, 0]],
    ['speed', [1200, 700, 0]],
    ['balanced', [1000, 833, 0]],
    ['minefield', [1000, 1000, -500]],
    ['jackpot', [900, 900, 0]],
  ] as const)('scores %s', (type, expected) => {
    const { until, answer, scores } = quiz(3, 5, type);
    until('question');
    answer(0, true);
    answer(1, true, 5000);
    answer(2, false, 6000);
    until('reveal');
    expect(scores()).toEqual(expected);
  });
});

describe('quiz powers', () => {
  it('deals three, four or five, and only usable ones when alone', () => {
    for (const [rounds, size] of [
      [5, 3],
      [7, 4],
      [10, 5],
    ])
      expect(dealPowers(rounds, 4)).toHaveLength(size);
    expect(dealPowers(5, 1)).toEqual(['half', 'wager']);
  });
  function match(powers: [number, QuizPower, number?][], good: boolean[], scores = [0, 0, 0]) {
    const t = quiz(3);
    for (const p of t.room.players)
      t.room.quiz!.hands[p.id] = ['smoke', 'half', 'wager', 'thief', 'rush', 'mirror', 'copycat'];
    t.room.players.forEach((p, i) => (p.score = scores[i]));
    t.until('power');
    for (const [i, name, target] of powers) t.power(i, name, target);
    t.until('question');
    return {
      ...t,
      finish() {
        good.forEach((g, i) => t.answer(i, g));
        t.until('reveal');
        return t.scores();
      },
    };
  }
  it('smoke bomb hides two answers from the target only', () => {
    const { room, seats } = match([[0, 'smoke', 1]], []);
    const hidden = (i: number) =>
      snapshot(room, room.started, seats[i].token).question!.options.filter((o) => !o).length;
    expect([0, 1, 2].map(hidden)).toEqual([0, 2, 0]);
  });
  it('half & half removes two wrong answers for 20% of the score', () => {
    const t = match([[0, 'half']], [true, true, false], [5000, 0, 0]);
    const removed = t.room.quiz!.removed[t.seats[0].id];
    expect(removed).toHaveLength(2);
    expect(removed).not.toContain(t.right());
    expect(() => t.play(0, { action: 'input', round: 1, value: removed[0] }, t.room.started)).toThrow('gone');
    expect(t.finish()).toEqual([5000 - 1000 + 1000, 1000, 0]);
  });
  it('all in doubles the points or loses 1000', () => {
    const t = match(
      [
        [0, 'wager'],
        [1, 'wager'],
      ],
      [true, false, true],
    );
    expect(t.finish()).toEqual([2000, -1000, 1000]);
  });
  it('pickpocket steals from a rival who is wrong, and copycat matches a better one', () => {
    const t = match(
      [
        [0, 'thief', 1],
        [1, 'copycat', 2],
      ],
      [true, false, true],
    );
    expect(t.finish()).toEqual([1400, 600, 1000]);
  });
  it('time crunch halves the time and the round does not wait for it', () => {
    const t = match([[0, 'rush', 1]], []);
    const { room } = t;
    t.answer(0, true);
    t.answer(2, true);
    expect(room.quiz!.stage).toBe('question');
    t.host({ action: 'view' }, room.started + 9999);
    expect(room.quiz!.stage).toBe('question');
    expect(() => t.answer(1, true, 10_000)).toThrow('closed');
    expect(room.quiz!.stage).toBe('suspense');
  });
  it('mirror sends powers back', () => {
    const t = match(
      [
        [0, 'smoke', 1],
        [1, 'mirror'],
        [2, 'thief', 1],
      ],
      [true, true, false],
    );
    expect(t.room.quiz!.smoked).toHaveProperty(t.seats[0].id);
    expect(t.room.quiz!.smoked).not.toHaveProperty(t.seats[1].id);
    expect(t.finish()).toEqual([1000, 1400, -400]);
  });
  it('can be used once, aimed only at others, and saved', () => {
    const t = quiz(2);
    t.until('power');
    expect(() => t.power(0, 'smoke', 0)).toThrow('another player');
    expect(() => t.power(0, 'smoke')).toThrow('another player');
    t.power(0, 'wager');
    t.power(1, null);
    const left = (i: number) => t.room.quiz!.hands[t.seats[i].id];
    expect(left(0)).toEqual(['smoke', 'half']);
    expect(left(1)).toHaveLength(3);
    t.until('reveal');
    t.next();
    t.until('power');
    expect(() => t.power(0, 'wager')).toThrow('already used');
  });
});

describe('reactions', () => {
  it('reach the TV during the reveal and results, for a moment, and not too often', () => {
    const { room, play, until, seats, next, answer } = quiz(2, 1);
    const cheer = (after: number) => play(0, { action: 'cheer', emoji: '🔥' }, room.started + after);
    const seen = (after: number) => snapshot(room, room.started + after, room.hostToken).cheers;
    until('question');
    cheer(0);
    expect(seen(0)).toEqual([]);
    // A winner, so the match ends instead of playing a tie-break.
    answer(0, true);
    until('reveal');
    cheer(0);
    cheer(300);
    expect(seen(300)).toMatchObject([{ from: seats[0].id, emoji: '🔥' }]);
    cheer(800);
    const numbers = seen(800).map((c) => c.n);
    expect(new Set(numbers).size).toBe(2);
    expect(seen(5000)).toEqual([]);
    next();
    cheer(9000);
    expect(seen(9000)).toHaveLength(1);
  });
});

describe('trivia', () => {
  const encoded = (over: Record<string, unknown> = {}) => ({
    category: 'Science%3A%20Computers',
    difficulty: 'easy',
    question: 'What%3F',
    correct_answer: 'A',
    incorrect_answers: ['B', 'C', 'D'],
    ...over,
  });
  it('reads good questions and skips hard, odd or broken ones', () => {
    const parsed = parseTrivia({
      results: [
        encoded(),
        encoded({ difficulty: 'hard' }),
        encoded({ category: 'Nonsense' }),
        encoded({ incorrect_answers: ['A', 'C', 'D'] }),
        encoded({ incorrect_answers: ['B'] }),
        encoded({ question: '%E0%A4%A' }),
        null,
      ],
    });
    expect(parsed).toEqual([{ theme: 'Technology', text: 'What?', right: 'A', wrong: ['B', 'C', 'D'] }]);
    expect(parseTrivia('nope')).toEqual([]);
  });
  it('falls back on our own questions, all well formed', async () => {
    expect(await findQuestions(T0)).toEqual(ownQuestions);
    for (const q of ownQuestions) expect(new Set([q.right, ...q.wrong]).size).toBe(4);
    expect(new Set(ownQuestions.map((q) => q.theme)).size).toBeGreaterThanOrEqual(10);
  });
});
