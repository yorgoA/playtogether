import { afterEach, describe, expect, it, vi } from 'vitest';
import { botPowerMs } from '../lib/server/quiz';
import { nextWake, tick, type Room } from '../lib/server/session';
import { DROP, T0, table } from './helpers';

afterEach(() => vi.restoreAllMocks());

// The same throws on every run, so a long match plays out the same way.
function seededRandom(seed = 5) {
  let n = seed;
  vi.spyOn(Math, 'random').mockImplementation(() => (n = (n * 16807) % 2147483647) / 2147483647);
}
// Moves a room on with nobody acting: only its clock, woken when it asks to be.
function runClock(room: Room, from: number, limit = 20_000) {
  let now = from;
  for (let wakes = 0; room.phase === 'playing' && wakes < limit; wakes++) {
    const at = nextWake(room, now);
    if (at === null) break;
    expect(at).toBeGreaterThan(now);
    now = at;
    tick(room, now);
  }
  return now;
}

describe('room clock', () => {
  it('ends a quiz nobody answers, tie-breaks included', () => {
    const { room, host } = table('quiz', 2, 2);
    host({ action: 'start' });
    runClock(room, T0);
    expect(room.phase).toBe('results');
  });

  it('ends a standoff nobody draws in', () => {
    const { room, host } = table('reaction', 2, 2);
    host({ action: 'start' });
    runClock(room, T0);
    expect(room.phase).toBe('results');
  });

  it('plays Storm Deck bots and runs out the clock on a silent phone', () => {
    seededRandom();
    const { room, host } = table('storm', 1);
    host({ action: 'addBot' });
    host({ action: 'addBot' });
    host({ action: 'start' });
    runClock(room, T0);
    expect(room.phase).toBe('results');
  });

  it('lets Island bots play a match through, standing in for a phone that left', () => {
    seededRandom();
    const { room, host, seats } = table('settlers', 1);
    host({ action: 'addBot' });
    host({ action: 'addBot' });
    host({ action: 'start' });
    host({ action: 'standIn', playerId: seats[0].id }, T0 + DROP);
    runClock(room, T0 + DROP);
    expect(room.phase).toBe('results');
  });

  it('wakes when a standoff bot draws, at its planned time', () => {
    seededRandom();
    const { room, host } = table('reaction', 1, 1);
    host({ action: 'addBot', difficulty: 'hard' });
    host({ action: 'start' });
    const bot = room.players[1];
    const aim = room.duel!.aims![bot.id] as { ms: number };
    expect(nextWake(room, T0)).toBe(room.signalAt + aim.ms);
    tick(room, room.signalAt + aim.ms);
    expect(bot).toMatchObject({ answered: true, reactionMs: aim.ms });
  });

  it('wakes when a quiz bot chooses a power and when it answers', () => {
    seededRandom();
    const { room, host } = table('quiz', 1, 1);
    host({ action: 'addBot', difficulty: 'hard' });
    host({ action: 'start' });
    const bot = room.players[1];
    tick(room, room.deadline);
    expect(room.quiz!.stage).toBe('power');
    expect(nextWake(room, room.started)).toBe(room.started + botPowerMs);
    tick(room, room.started + botPowerMs);
    expect(room.quiz!.chosen[bot.id]).toBeDefined();
    tick(room, room.deadline);
    expect(room.quiz!.stage).toBe('question');
    const at = room.started + room.quiz!.aims![bot.id].at;
    expect(nextWake(room, room.started)).toBe(at);
    tick(room, at);
    expect(room.quiz!.picks[bot.id].at).toBe(at);
  });

  it.each(['quiz', 'reaction'])('plays a whole %s match with bots on the clock alone', (game) => {
    seededRandom();
    const { room, host } = table(game, 1, 2);
    host({ action: 'addBot' });
    host({ action: 'addBot', difficulty: 'hard' });
    host({ action: 'start' });
    runClock(room, T0);
    expect(room.phase).toBe('results');
  });

  it('wakes for a Kings Cup race to settle', () => {
    const { room, host } = table('kings', 2);
    host({ action: 'start' });
    room.kings!.raceUntil = T0 + 3000;
    expect(nextWake(room, T0)).toBe(T0 + 3000);
  });

  it('has nothing to wake for outside a match, while paused, or in Pyramid', () => {
    const quiz = table('quiz', 1);
    expect(nextWake(quiz.room, T0)).toBeNull();
    quiz.host({ action: 'start' });
    expect(nextWake(quiz.room, T0)).toBe(quiz.room.deadline);
    quiz.host({ action: 'pause' });
    expect(nextWake(quiz.room, T0)).toBeNull();
    const pyramid = table('pyramid', 2);
    pyramid.host({ action: 'start' });
    expect(nextWake(pyramid.room, T0)).toBeNull();
  });
});
