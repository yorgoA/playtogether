import { afterEach, describe, expect, it, vi } from 'vitest';
import { difficulties } from '../lib/contract';
import { quizTypes } from '../lib/quiz/rules';
import { botPowerMs } from '../lib/server/quiz';
import { table } from './helpers';

afterEach(() => vi.restoreAllMocks());

// The same throws on every run, so a long match plays out the same way.
function seededRandom(seed = 11) {
  let n = seed;
  vi.spyOn(Math, 'random').mockImplementation(() => (n = (n * 16807) % 2147483647) / 2147483647);
}

// One silent phone and one bot.
function quiz(level: string, rounds = 1) {
  const t = table('quiz', 1, rounds);
  t.host({ action: 'addBot', difficulty: level });
  t.host({ action: 'start' });
  const { room } = t;
  for (const q of room.quiz!.rounds) q.type = 'accuracy';
  const [human, bot] = room.players;
  const at = (ms: number) => t.host({ action: 'view' }, room.started + ms);
  const next = () => {
    t.host({ action: 'view' }, room.deadline);
    human.lastSeen = room.started;
  };
  const until = (stage: string) => {
    while (room.quiz!.stage !== stage && room.phase === 'playing') next();
  };
  return { ...t, human, bot, at, next, until };
}

function duel(level: string, rounds = 1) {
  const t = table('reaction', 1, rounds);
  t.host({ action: 'addBot', difficulty: level });
  t.host({ action: 'start' });
  const bot = t.room.players[1];
  const at = (ms: number) => t.host({ action: 'view' }, t.room.signalAt + ms);
  return { ...t, bot, at };
}

describe('quiz bots', () => {
  it('answer when their moment comes, and know the answer as often as their level', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { room, bot, at, until } = quiz('hard');
    until('question');
    const when = Math.round(quizTypes.accuracy.ms * 0.15);
    at(when - 1);
    expect(bot.answered).toBe(false);
    at(when);
    expect(room.quiz!.picks[bot.id]).toEqual({
      value: room.quiz!.rounds[0].correct,
      at: room.started + when,
    });
  });

  it('answer late at the easy level, and guess when they do not know', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const { room, bot, at, until } = quiz('easy');
    until('question');
    const when = Math.round(quizTypes.accuracy.ms * (0.45 + 0.99 * 0.4));
    at(when - 1);
    expect(bot.answered).toBe(false);
    at(when);
    // 0.99 is above the 30% of questions an easy bot knows, so it picks among all four answers: the last one.
    expect(room.quiz!.picks[bot.id]).toEqual({ value: 3, at: room.started + when });
  });

  it('choose a power a moment into the power stage: easy keeps them, hard aims at the leader', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const easy = quiz('easy');
    easy.until('power');
    easy.at(botPowerMs - 1);
    expect(easy.room.quiz!.chosen[easy.bot.id]).toBeUndefined();
    easy.at(botPowerMs);
    expect(easy.room.quiz!.chosen[easy.bot.id]).toEqual({ power: null });
    const hard = quiz('hard');
    hard.until('power');
    hard.at(botPowerMs);
    const { power, target } = hard.room.quiz!.chosen[hard.bot.id];
    expect(power).toBeTruthy();
    expect([undefined, hard.human.id]).toContain(target);
  });

  it('sit out a tie-break they are not part of', () => {
    const { room, bot, human, at, until } = quiz('hard');
    room.contenders = [human.id];
    until('question');
    at(quizTypes.accuracy.ms - 1);
    expect(bot.answered).toBe(false);
  });

  it.each(difficulties)('play a whole match at the %s level', (level) => {
    seededRandom();
    const { room, next } = quiz(level, 5);
    for (let ticks = 0; room.phase === 'playing' && ticks < 500; ticks++) next();
    expect(room.phase).toBe('results');
  });
});

describe('standoff bots', () => {
  it('draw a moment after the signal, fastest at the hard level', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { bot, at } = duel('hard');
    at(209);
    expect(bot.answered).toBe(false);
    at(210);
    expect(bot).toMatchObject({ answered: true, reactionMs: 210 });
  });

  it('sometimes jump the gun at the easy level', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { bot, at } = duel('easy');
    at(-401);
    expect(bot.answered).toBe(false);
    at(-400);
    expect(bot).toMatchObject({ answered: true, early: true });
  });

  it.each(difficulties)('play a whole match at the %s level', (level) => {
    seededRandom();
    const { room, host, bot } = duel(level, 3);
    let now = room.started;
    for (let ticks = 0; room.phase === 'playing' && ticks < 500; ticks++) {
      // The phone never draws: wait for the bot's shot, then for the end of the draw.
      now = Math.max(now, room.revealing || bot.answered ? room.deadline : room.signalAt + 1000);
      host({ action: 'view' }, now);
    }
    expect(room.phase).toBe('results');
  });
});
