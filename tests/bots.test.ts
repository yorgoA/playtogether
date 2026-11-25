import { afterEach, describe, expect, it, vi } from 'vitest';
import { difficulties, type StormView } from '../lib/contract';
import { botColors, botName, botNames } from '../lib/server/bots';
import { botDelayMs } from '../lib/server/engine';
import { snapshot } from '../lib/server/session';
import { newStorm, stormBot, stormMove, stormOver, stormView } from '../lib/server/storm';
import { DROP, T0, table as room } from './helpers';

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

  it('play a Gust or a Calm before drawing, at every level', () => {
    expect(stormBot(table({ hand: ['F1', 'C', 'G'] }), 'me', 'normal')).toEqual({
      move: 'play',
      card: 'G',
      target: 'b',
      give: 'F1',
      seq: 4,
    });
    expect(stormBot(table({ hand: ['F1', 'C'] }), 'me', 'normal')).toMatchObject({ move: 'play', card: 'C' });
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(stormBot(table({ hand: ['F1', 'C'] }), 'me', 'easy')).toMatchObject({ move: 'play', card: 'C' });
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

  it('take a win in one move: a Gust that gives away their last other card', () => {
    const last = table({ hand: ['E4', 'G'] });
    for (const level of ['normal', 'hard'] as const)
      expect(stormBot(last, 'me', level)).toEqual({
        move: 'play',
        card: 'G',
        target: 'b',
        give: 'E4',
        seq: 4,
      });
  });

  it.each(difficulties)(
    'play only legal moves at the %s level, and finish every match among four bots',
    (level) => {
      const unfinished = [];
      for (let seed = 1; seed <= 60; seed++) {
        seededRandom(seed);
        const s = newStorm(['a', 'b', 'c', 'd']);
        for (let moves = 0; !stormOver(s) && moves < 5000; moves++)
          stormMove(s, s.turn, stormBot(stormView(s, s.turn), s.turn, level));
        if (!stormOver(s)) unfinished.push(seed);
        vi.restoreAllMocks();
      }
      expect(unfinished).toEqual([]);
    },
  );
});

describe('bot seats', () => {
  it('seat up to three bots at a Storm Deck table, each with its level and its own name', () => {
    const { room: r, host } = room('storm', 1);
    host({ action: 'addBot', difficulty: 'hard' });
    host({ action: 'addBot' });
    host({ action: 'addBot', difficulty: 'easy' });
    const bots = r.players.filter((p) => p.bot);
    expect(bots.map((p) => p.difficulty)).toEqual(['hard', 'normal', 'easy']);
    expect(new Set(bots.map((p) => p.name.toLowerCase())).size).toBe(3);
    for (const bot of bots) expect(bot).toMatchObject({ avatar: '🤖', name: expect.toBeOneOf(botNames) });
    expect(() => host({ action: 'addBot' })).toThrow('No bot seat available.');
    expect(snapshot(r, T0, r.hostToken).players[1]).toMatchObject({ bot: true, difficulty: 'hard' });
  });

  it('never seat more players than the game takes', () => {
    const { host } = room('storm', 7);
    host({ action: 'addBot' });
    expect(() => host({ action: 'addBot' })).toThrow('No bot seat available.');
  });

  it('are refused in games without a bot, outside the lobby, or at an unknown level', () => {
    for (const game of ['kings', 'pyramid'])
      expect(() => room(game, 1).host({ action: 'addBot' })).toThrow('has no bots yet.');
    const { host } = room('storm', 1);
    expect(() => host({ action: 'addBot', difficulty: 'genius' })).toThrow('Choose easy, normal or hard.');
    host({ action: 'addBot' });
    host({ action: 'start' });
    expect(() => host({ action: 'addBot' })).toThrow('Add bots in the lobby.');
  });

  it('never start a match without a phone at the table', () => {
    const { host } = room('storm', 0);
    host({ action: 'addBot' });
    host({ action: 'addBot' });
    expect(() => host({ action: 'start' })).toThrow('Join with a phone before starting.');
  });

  it('wear a colour no player at the table has', () => {
    const { room: r, host } = room('storm', 4);
    r.players.forEach((p, i) => (p.color = botColors[i]));
    for (let i = 0; i < 3; i++) host({ action: 'addBot' });
    const colors = r.players.map((p) => p.color);
    expect(new Set(colors).size).toBe(colors.length);
  });

  it('end the match once no phone is left at the table', () => {
    const { room: r, host, seats } = room('storm', 1);
    host({ action: 'addBot' });
    host({ action: 'addBot' });
    host({ action: 'start' });
    // A phone can only be removed once it has gone quiet.
    host({ action: 'kick', playerId: seats[0].id }, T0 + DROP);
    expect(r.phase).toBe('results');
    expect(r.players.every((p) => p.bot)).toBe(true);
  });

  it('get numbered names once every bot name is taken', () => {
    expect(botName([...botNames, 'BOT 1'])).toBe('Bot 2');
  });

  it('play their Storm Deck turn a moment after it starts', () => {
    const { room: r, host } = room('storm', 1);
    host({ action: 'addBot' });
    host({ action: 'start' });
    const s = r.storm!;
    const bot = r.players[1].id;
    s.order = [bot, r.players[0].id];
    s.turn = bot;
    // A card that fits, so a play proves the bot chose it: running out of time can only draw.
    s.piles = ['E3', 'T7'];
    s.hands[bot] = ['E4', 'F1'];
    host({ action: 'view' }, T0 + botDelayMs - 1);
    expect(s.seq).toBe(0);
    host({ action: 'view' }, T0 + botDelayMs);
    expect(s.seq).toBe(1);
    expect(s.event).toMatchObject({ kind: 'play', by: bot, card: 'E4', pile: 0 });
  });
});
