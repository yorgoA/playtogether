import { afterEach, describe, expect, it, vi } from 'vitest';
import { difficulties, type StormView } from '../lib/contract';
import { newStorm, stormBot, stormMove, stormOver, stormView } from '../lib/server/storm';

afterEach(() => vi.restoreAllMocks());

// The same throws on every run, so a long match plays out the same way.
function seededRandom(seed = 7) {
  let n = seed;
  vi.spyOn(Math, 'random').mockImplementation(() => (n = (n * 16807) % 2147483647) / 2147483647);
}
const table = (over: Partial<StormView> = {}): StormView => ({
  order: ['me', 'a', 'b'],
  turn: 'me',
  seq: 4,
  piles: ['E3', 'T7'],
  streak: null,
  storm: 0,
  event: null,
  sizes: { me: 4, a: 5, b: 3 },
  hand: ['F1', 'E4'],
  ...over,
});

describe('Storm Deck bots', () => {
  it('slip one turn in three at the easy level', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(stormBot(table(), 'me', 'easy')).toEqual({ move: 'draw', seq: 4 });
    expect(stormBot(table({ streak: 0, piles: ['E4', 'T7'], hand: ['E5'] }), 'me', 'easy')).toEqual({
      move: 'end',
      seq: 4,
    });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(stormBot(table(), 'me', 'easy')).toEqual({ move: 'play', card: 'E4', pile: 0, seq: 4 });
  });

  it('play a Gust or a Calm before drawing, from the normal level', () => {
    expect(stormBot(table({ hand: ['F1', 'C', 'G'] }), 'me', 'normal')).toEqual({
      move: 'play',
      card: 'G',
      target: 'b',
      give: 'F1',
      seq: 4,
    });
    expect(stormBot(table({ hand: ['F1', 'C'] }), 'me', 'normal')).toMatchObject({ move: 'play', card: 'C' });
    expect(stormBot(table({ hand: ['F1', 'C'] }), 'me', 'easy')).toMatchObject({ move: 'draw' });
    expect(stormBot(table({ hand: ['F1'] }), 'me', 'normal')).toMatchObject({ move: 'draw' });
  });

  it('keep a streak going while a neighbour fits, then end the turn', () => {
    const streak = { streak: 0 as const, piles: ['E4', 'T7'] as [string, string] };
    expect(stormBot(table({ ...streak, hand: ['T5', 'F1'] }), 'me', 'normal')).toMatchObject({
      move: 'play',
      card: 'T5',
      pile: 0,
    });
    expect(stormBot(table({ ...streak, hand: ['F1'] }), 'me', 'hard')).toMatchObject({ move: 'end' });
  });

  it('start the longest streak, and blow a Gust at a rival close to winning, at the hard level', () => {
    // E4 ends its streak at once. D2 then T1 then T8 lays down three cards.
    const hand = ['E4', 'T8', 'T1', 'D2'];
    expect(stormBot(table({ hand }), 'me', 'normal')).toMatchObject({ card: 'E4', pile: 0 });
    expect(stormBot(table({ hand }), 'me', 'hard')).toMatchObject({ card: 'D2', pile: 0 });
    const close = table({ hand: ['E4', 'G', 'T2', 'F1'], sizes: { me: 4, a: 5, b: 2 } });
    expect(stormBot(close, 'me', 'hard')).toEqual({
      move: 'play',
      card: 'G',
      target: 'b',
      give: 'F1',
      seq: 4,
    });
    expect(stormBot(close, 'me', 'normal')).toMatchObject({ card: 'E4' });
  });

  it.each(difficulties)('play only legal moves at the %s level, until a match ends', (level) => {
    seededRandom();
    const s = newStorm(['a', 'b', 'c', 'd']);
    for (let moves = 0; !stormOver(s) && moves < 5000; moves++)
      stormMove(s, s.turn, stormBot(stormView(s, s.turn), s.turn, level));
    expect(stormOver(s)).toBe(true);
  });
});
