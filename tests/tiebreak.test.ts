import { afterEach, describe, expect, it, vi } from 'vitest';
import { maxTiebreaks } from '../lib/server/rounds';
import { snapshot } from '../lib/server/session';
import { startQuiz } from '../lib/server/quiz';
import { ownQuestions } from '../lib/server/trivia';
import { DROP, T0, table } from './helpers';

afterEach(() => vi.restoreAllMocks());

function quiz(count: number, rounds: number) {
  const t = table('quiz', count, rounds);
  const { room } = t;
  t.host({ action: 'start' });
  for (const q of room.quiz!.rounds) q.type = 'accuracy';
  const next = () => {
    t.host({ action: 'view' }, room.deadline);
    for (const p of room.players) p.lastSeen = room.started;
  };
  const until = (stage: string) => {
    while (room.quiz!.stage !== stage && room.phase === 'playing') next();
  };
  // Plays the current round up to its reveal. Each player answers right (true), wrong (false) or not at all (null).
  const round = (...answers: (boolean | null)[]) => {
    until('question');
    const { correct } = room.quiz!.rounds[room.round - 1];
    answers.forEach((good, i) => {
      if (good !== null)
        t.play(
          i,
          { action: 'input', round: room.round, value: (correct + (good ? 0 : 1)) % 4 },
          room.started,
        );
    });
    until('reveal');
  };
  const view = () => snapshot(room, room.deadline, room.hostToken);
  const scores = () => room.players.map((p) => p.score);
  return { ...t, next, until, round, view, scores };
}

describe('tie-breaks', () => {
  it('ends after the chosen rounds when one player leads', () => {
    const { room, round, next, view } = quiz(2, 1);
    round(true, false);
    next();
    expect(room.phase).toBe('results');
    expect(view()).toMatchObject({ round: 1, rounds: 1, tiebreak: false });
  });

  it('plays one more round, for the tied players, when the lead is shared after the last round', () => {
    const { room, round, next, view, scores } = quiz(3, 1);
    expect(room.asked).toHaveLength(1);
    round(true, true, false);
    const at = room.deadline;
    next();
    expect(room).toMatchObject({ phase: 'playing', round: 2, started: at });
    expect(room.quiz!.stage).toBe('intro');
    expect(view()).toMatchObject({ round: 2, rounds: 2, tiebreak: true });
    expect(room.asked).toContain(room.quiz!.rounds[1].text);
    round(false, true, null);
    next();
    expect(room.phase).toBe('results');
    expect(scores()).toEqual([1000, 2000, 0]);
  });

  it('lets the leaders share the win after three tie-breaks, even at nil all', () => {
    const { room, round, next, view, scores } = quiz(2, 1);
    for (let played = 0; played <= maxTiebreaks; played++) {
      expect(room.phase).toBe('playing');
      round(null, null);
      next();
    }
    expect(room.phase).toBe('results');
    expect(scores()).toEqual([0, 0]);
    expect(view()).toMatchObject({ round: 1 + maxTiebreaks, rounds: 1 + maxTiebreaks, tiebreak: true });
  });

  it('ends as a shared win when a quiz has no spare question', () => {
    const { room, round, next } = quiz(2, 1);
    // Rooms stored before tie-breaks existed.
    room.quiz!.rounds.splice(1);
    round(true, true);
    next();
    expect(room.phase).toBe('results');
  });

  it('breaks a tie in the standoff too, and the lobby goes back to the rounds chosen', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { room, host, play } = table('reaction', 2, 2);
    host({ action: 'start' });
    const shoot = (i: number, reactionMs: number) =>
      play(i, { action: 'input', round: room.round, draw: room.duel!.draw, reactionMs }, room.signalAt + 600);
    const next = () => host({ action: 'view' }, room.deadline);
    const view = () => snapshot(room, room.deadline, room.hostToken);
    shoot(0, 200);
    shoot(1, 300);
    next();
    shoot(0, 300);
    shoot(1, 200);
    next();
    expect(room.players.map((p) => p.score)).toEqual([600, 600]);
    expect(view()).toMatchObject({ phase: 'playing', round: 3, rounds: 3, tiebreak: true });
    shoot(0, 200);
    shoot(1, 300);
    next();
    expect(room.phase).toBe('results');
    host({ action: 'lobby' });
    expect(view()).toMatchObject({ phase: 'lobby', rounds: 2, tiebreak: false });
  });
});

describe('tie-break contenders', () => {
  // Three players level on 5000 / 5000 / 4000 after the only round: the third is a bystander.
  function bystander() {
    const t = quiz(3, 1);
    t.room.players.forEach((p, i) => (p.score = [4000, 4000, 3000][i]));
    t.round(true, true, true);
    t.next();
    return t;
  }
  const answerFor = (room: ReturnType<typeof quiz>['room'], good: boolean) => ({
    action: 'input',
    round: room.round,
    value: (room.quiz!.rounds[room.round - 1].correct + (good ? 0 : 1)) % 4,
  });

  it('lists the players tied for first, and nobody outside a tie-break', () => {
    const { room, seats, view, host } = bystander();
    expect(room.contenders).toEqual([seats[0].id, seats[1].id]);
    expect(view()).toMatchObject({ tiebreak: true, contenders: [seats[0].id, seats[1].id] });
    host({ action: 'lobby' });
    expect(view()).toMatchObject({ tiebreak: false, contenders: [] });
    expect(room.contenders).toBeUndefined();
  });

  it('keeps a bystander from winning: they cannot answer, use a power or score', () => {
    const { room, play, until, round, next, scores, seats } = bystander();
    until('question');
    expect(() => play(2, answerFor(room, true), room.started)).toThrow('tied for first');
    expect(() =>
      play(0, { action: 'quizPower', round: room.round, power: 'smoke', target: seats[2].id }, room.started),
    ).toThrow('no powers');
    expect(() => play(2, { action: 'quizPower', round: room.round, power: null }, room.started)).toThrow(
      'no powers',
    );
    play(0, answerFor(room, false), room.started);
    play(1, answerFor(room, false), room.started);
    until('reveal');
    expect(scores()).toEqual([5000, 5000, 4000]);
    next();
    // Still level, and the bystander still cannot catch up: the match ends level at the top.
    for (let i = 1; i < maxTiebreaks; i++) {
      round(false, false, null);
      next();
    }
    expect(room.phase).toBe('results');
    expect(scores()).toEqual([5000, 5000, 4000]);
  });

  it('plays a tie-break without the power stage and without Minefield', () => {
    const { room, until } = bystander();
    room.quiz!.rounds[room.round - 1].type = 'accuracy';
    expect(room.quiz!.stage).toBe('intro');
    until('question');
    expect(room.quiz!.stage).toBe('question');
    for (let run = 0; run < 100; run++) {
      const { room: fresh } = table('quiz', 3, 5);
      startQuiz(fresh, ownQuestions, T0);
      for (const q of fresh.quiz!.rounds.slice(5)) expect(q.type).not.toBe('minefield');
    }
  });

  it('narrows to the contenders still level at the top', () => {
    const { room, seats, round, next, scores } = quiz(3, 1);
    round(true, true, true);
    next();
    expect(room.contenders).toEqual(seats.map((s) => s.id));
    round(true, true, false);
    next();
    expect(room.contenders).toEqual([seats[0].id, seats[1].id]);
    // The one left out watches: they cannot get back in, and the other two stay tied.
    round(true, true, null);
    next();
    expect(room).toMatchObject({ phase: 'playing', tiebreaks: 3 });
    expect(room.contenders).toEqual([seats[0].id, seats[1].id]);
    round(true, false, null);
    next();
    expect(room.phase).toBe('results');
    expect(scores()).toEqual([4000, 3000, 1000]);
  });

  it('ends a shared win after three tie-breaks that settle nothing', () => {
    const { room, seats, round, next, scores } = bystander();
    for (let played = 1; played <= maxTiebreaks; played++) {
      expect(room.phase).toBe('playing');
      round(true, true, null);
      next();
    }
    expect(room.phase).toBe('results');
    expect(room.tiebreaks).toBe(maxTiebreaks);
    expect(scores()).toEqual([5000 + 3 * 1000, 5000 + 3 * 1000, 4000]);
    expect(room.contenders).toEqual([seats[0].id, seats[1].id]);
  });

  it('gives the win at once to the last contender when the others leave', () => {
    const { room, seats, host, scores } = bystander();
    room.players[1].lastSeen = room.started - DROP;
    host({ action: 'kick', playerId: seats[1].id }, room.started);
    expect(room.phase).toBe('results');
    expect(room.contenders).toEqual([seats[0].id]);
    expect(scores()).toEqual([5000, 4000]);
  });

  it('keeps the standoff to the contenders', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const { room, host, play } = table('reaction', 3, 1);
    host({ action: 'start' });
    const shoot = (i: number, reactionMs: number) =>
      play(i, { action: 'input', round: room.round, draw: room.duel!.draw, reactionMs }, room.signalAt + 600);
    const next = () => host({ action: 'view' }, room.deadline);
    shoot(0, 200);
    shoot(1, 300);
    shoot(2, 400);
    next();
    shoot(0, 200);
    shoot(1, 300);
    // P0 wins the round; P0 and P1 are level at the top, P2 is not.
    room.players.forEach((p, i) => (p.score = [1000, 1000, 0][i]));
    next();
    expect(room).toMatchObject({ phase: 'playing', round: 2 });
    expect(room.contenders).toEqual(room.players.slice(0, 2).map((p) => p.id));
    expect(room.duel!.alive).toEqual(room.contenders);
    expect(() => shoot(2, 100)).toThrow('out of this round');
    shoot(0, 200);
    shoot(1, 300);
    expect(room.players.map((p) => p.score)).toEqual([1600, 1000, 0]);
    next();
    expect(room.phase).toBe('results');
  });
});
