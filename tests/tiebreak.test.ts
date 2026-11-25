import { afterEach, describe, expect, it, vi } from 'vitest';
import { maxTiebreaks } from '../lib/server/rounds';
import { snapshot } from '../lib/server/session';
import { table } from './helpers';

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
  return { ...t, next, round, view, scores };
}

describe('tie-breaks', () => {
  it('ends after the chosen rounds when one player leads', () => {
    const { room, round, next, view } = quiz(2, 1);
    round(true, false);
    next();
    expect(room.phase).toBe('results');
    expect(view()).toMatchObject({ round: 1, rounds: 1, tiebreak: false });
  });

  it('plays one more round, for everyone, when the lead is shared after the last round', () => {
    const { room, round, next, view, scores } = quiz(3, 1);
    expect(room.asked).toHaveLength(1);
    round(true, true, false);
    const at = room.deadline;
    next();
    expect(room).toMatchObject({ phase: 'playing', round: 2, started: at });
    expect(room.quiz!.stage).toBe('intro');
    expect(view()).toMatchObject({ round: 2, rounds: 2, tiebreak: true });
    expect(room.asked).toContain(room.quiz!.rounds[1].text);
    round(false, true, true);
    next();
    expect(room.phase).toBe('results');
    expect(scores()).toEqual([1000, 2000, 1000]);
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
