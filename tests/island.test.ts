import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  active,
  edges,
  devCards,
  devDeck,
  emptyHand,
  goal,
  limits,
  locations,
  longestRoadOwner,
  piecesLeft,
  pointsFor,
  ports,
  portsOf,
  roadLength,
  robberTile,
  shuffledLayout,
  sixesApart,
  tiles,
  tilesOf,
  tradeRate,
  vertices,
  type DevCard,
  type Hand,
  type Island,
} from '../lib/island/board';
import { bankLeft, islandMove, newIsland, startIsland, totalPoints } from '../lib/server/island';
import { botMove } from '../lib/server/island-bot';

afterEach(() => vi.restoreAllMocks());

const move = (b: Island, id: string, command: Record<string, unknown>) =>
  islandMove(b, id, id, { revision: b.revision, ...command });
const cards = (hand: Partial<Hand>): Hand => ({ ...emptyHand(), ...hand });
const total = (hand: Hand) => Object.values(hand).reduce((a, n) => a + n, 0);

function afterSetup(ids = ['a', 'b']) {
  const b = newIsland(ids);
  while (b.setup < 2 * ids.length) {
    const id = active(b),
      piece = b.phase as 'settlement' | 'road';
    move(b, id, { move: 'place', piece, index: locations(b, id, piece)[0] });
  }
  return b;
}
function rolls(first: number, second: number) {
  vi.spyOn(Math, 'random')
    .mockReturnValueOnce((first - 1) / 6 + 0.01)
    .mockReturnValueOnce((second - 1) / 6 + 0.01);
}

describe('board', () => {
  it('has the standard shape', () => {
    expect([tiles.length, vertices.length, edges.length, ports.length]).toEqual([19, 54, 72, 9]);
    expect(tiles.filter((t) => t.resource === 'sand')).toHaveLength(1);
  });
  it('keeps settlements at least two edges apart', () => {
    const b = newIsland(['a', 'b']);
    move(b, 'a', { move: 'place', piece: 'settlement', index: 0 });
    b.phase = 'settlement';
    const next = edges.filter((e) => e.a === 0 || e.b === 0).map((e) => (e.a === 0 ? e.b : e.a));
    for (const v of [0, ...next]) expect(locations(b, 'b', 'settlement')).not.toContain(v);
  });
  it('does not extend a road through an opponent settlement', () => {
    const b = afterSetup();
    b.homes = {};
    b.roads = {};
    b.phase = 'build';
    const first = edges.findIndex((e) =>
      [e.a, e.b].every((v) => edges.filter((x) => x.a === v || x.b === v).length === 3),
    );
    const blocked = edges[first].b;
    b.roads[first] = 'a';
    const beyond = edges.flatMap((e, i) => (i !== first && (e.a === blocked || e.b === blocked) ? [i] : []));
    expect(locations(b, 'a', 'road')).toEqual(expect.arrayContaining(beyond));
    b.homes[blocked] = { id: 'b', city: false };
    for (const i of beyond) expect(locations(b, 'a', 'road')).not.toContain(i);
  });
});

describe('shuffled maps', () => {
  it('keep the same pieces, keep 6 and 8 apart and leave the desert empty', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const layout = shuffledLayout(),
        land = tilesOf({ layout });
      const pieces = (list: (string | number)[]) => [...list].sort().join();
      expect(pieces(layout.terrain)).toBe(pieces(tiles.map((t) => t.resource)));
      expect(pieces(layout.numbers)).toBe(pieces(tiles.map((t) => t.number)));
      expect(pieces(layout.ports)).toBe(pieces(ports.map((p) => p.kind)));
      expect(land.every((t) => (t.resource === 'sand') === (t.number === 0))).toBe(true);
      expect(sixesApart(layout.numbers)).toBe(true);
      seen.add(JSON.stringify(layout));
    }
    expect(seen.size).toBe(100);
  });
  it('decide production, robber and ports', () => {
    const b = afterSetup();
    b.layout = {
      terrain: tiles.map((_, i) => (i ? 'ore' : 'sand')),
      numbers: tiles.map((_, i) => (i === 18 ? 2 : i ? 12 : 0)),
      ports: ports.map(() => 'wool'),
    };
    b.hands = { a: emptyHand(), b: emptyHand() };
    b.homes = { [tiles[18].vs[2]]: { id: 'a', city: true }, [ports[0].a]: { id: 'b', city: false } };
    expect(robberTile(b)).toBe(0);
    expect(tradeRate(b, 'b', 'wool')).toBe(2);
    expect(tradeRate(b, 'b', 'ore')).toBe(4);
    rolls(1, 1);
    move(b, 'a', { move: 'roll' });
    expect(b.hands.a).toEqual(cards({ ore: 2 }));
    expect(portsOf(b)).toHaveLength(9);
  });
});

describe('roll-off', () => {
  it('seats players from highest to lowest roll', () => {
    const b = startIsland(['a', 'b', 'c']);
    expect(() => move(b, 'b', { move: 'roll' })).toThrow('Wait for your turn');
    for (const [id, x, y] of [
      ['a', 1, 2],
      ['b', 6, 6],
      ['c', 4, 4],
    ] as const) {
      expect(b.phase).toBe('order');
      rolls(x, y);
      move(b, id, { move: 'roll' });
    }
    expect(b.order).toEqual(['b', 'c', 'a']);
    expect([active(b), b.phase]).toEqual(['b', 'settlement']);
    expect(Object.values(b.hands).every((h) => total(h) === 0)).toBe(true);
  });
  it('re-rolls ties without moving anyone else', () => {
    const b = startIsland(['a', 'b', 'c']);
    const roll = (x: number, y: number) => {
      rolls(x, y);
      move(b, active(b), { move: 'roll' });
    };
    roll(5, 5); // a 10
    roll(1, 2); // b 3
    roll(6, 4); // c 10, tied with a
    expect([b.phase, active(b)]).toEqual(['order', 'a']);
    roll(2, 2); // a 4
    expect(active(b)).toBe('c');
    roll(1, 3); // c 4, tied again
    expect([b.phase, active(b)]).toEqual(['order', 'a']);
    roll(1, 1);
    roll(6, 6);
    expect(b.order).toEqual(['c', 'a', 'b']);
    expect(b.phase).toBe('settlement');
  });
});

describe('setup', () => {
  it('goes forward, then in reverse, then rolls', () => {
    const b = newIsland(['a', 'b', 'c']),
      order: string[] = [];
    while (b.phase !== 'roll') {
      const id = active(b),
        piece = b.phase as 'settlement' | 'road';
      if (piece === 'settlement') order.push(id);
      move(b, id, { move: 'place', piece, index: locations(b, id, piece)[0] });
    }
    expect(order).toEqual(['a', 'b', 'c', 'c', 'b', 'a']);
    expect(active(b)).toBe('a');
    for (const id of b.order) expect(pointsFor(b, id)).toBe(2);
  });
  it('gives resources for the second settlement only', () => {
    const b = newIsland(['a', 'b']);
    move(b, 'a', { move: 'place', piece: 'settlement', index: locations(b, 'a', 'settlement')[0] });
    expect(total(b.hands.a)).toBe(0);
    expect(total(afterSetup().hands.b)).toBeGreaterThan(0);
  });
});

describe('turns', () => {
  it('rejects stale, out-of-turn and out-of-phase moves', () => {
    const b = afterSetup();
    expect(() => islandMove(b, 'a', 'a', { move: 'roll', revision: b.revision - 1 })).toThrow(
      'board changed',
    );
    expect(() => move(b, 'b', { move: 'roll' })).toThrow('Wait for your turn');
    expect(() => move(b, 'a', { move: 'end' })).toThrow('unavailable');
  });
  it('pays settlements once and cities twice, except on the robber tile', () => {
    const b = afterSetup(),
      i = tiles.findIndex((t, k) => t.number === 8 && k !== robberTile(b)),
      t = tiles[i];
    const other = tiles.findIndex((x, k) => x.number === 8 && k !== i);
    b.homes = { [t.vs[0]]: { id: 'a', city: false }, [t.vs[2]]: { id: 'b', city: true } };
    b.hands = { a: emptyHand(), b: emptyHand() };
    expect(tiles[other].vs).not.toContain(t.vs[0]);
    rolls(4, 4);
    move(b, 'a', { move: 'roll' });
    expect([b.hands.a, b.hands.b]).toEqual([cards({ [t.resource]: 1 }), cards({ [t.resource]: 2 })]);
    b.phase = 'roll';
    b.robber = i;
    rolls(4, 4);
    move(b, 'a', { move: 'roll' });
    expect([total(b.hands.a), total(b.hands.b)]).toEqual([1, 2]);
  });
  it('charges for building and rejects what you cannot afford', () => {
    const b = afterSetup();
    b.phase = 'build';
    b.hands.a = emptyHand();
    const index = locations(b, 'a', 'road')[0];
    expect(() => move(b, 'a', { move: 'place', piece: 'road', index })).toThrow('more resources');
    b.hands.a = cards({ timber: 1, clay: 1 });
    move(b, 'a', { move: 'place', piece: 'road', index });
    expect(b.roads[index]).toBe('a');
    expect(total(b.hands.a)).toBe(0);
  });
  it('upgrades a settlement to a two-point city', () => {
    const b = afterSetup();
    b.phase = 'build';
    b.hands.a = cards({ grain: 2, ore: 3 });
    move(b, 'a', { move: 'place', piece: 'city', index: locations(b, 'a', 'city')[0] });
    expect(pointsFor(b, 'a')).toBe(3);
  });
});

describe('rolling seven', () => {
  it('discards half of large hands, then moves the robber and steals', () => {
    const b = afterSetup();
    b.hands = { a: cards({ ore: 9 }), b: cards({ wool: 7 }) };
    rolls(3, 4);
    move(b, 'a', { move: 'roll' });
    expect(b.phase).toBe('discard');
    expect(b.owed).toEqual({ a: 4 });
    expect(() => move(b, 'a', { move: 'discard', cards: ['wool', 'wool', 'wool', 'wool'] })).toThrow(
      'from your hand',
    );
    move(b, 'a', { move: 'discard', cards: ['ore', 'ore', 'ore', 'ore'] });
    expect(b.phase).toBe('robber');
    expect(() => move(b, 'a', { move: 'robber', index: robberTile(b) })).toThrow('different tile');
    const target = tiles.findIndex((t, i) => i !== robberTile(b) && t.vs.some((v) => b.homes[v]?.id === 'b'));
    move(b, 'a', { move: 'robber', index: target });
    expect(b.phase).toBe('steal');
    expect(() => move(b, 'a', { move: 'steal', target: 'a' })).toThrow('adjacent opponent');
    move(b, 'a', { move: 'steal', target: 'b' });
    expect(b.hands).toEqual({ a: cards({ ore: 5, wool: 1 }), b: cards({ wool: 6 }) });
    expect(b.phase).toBe('build');
  });
});

describe('trading', () => {
  function building(hands: Record<string, Hand>) {
    const b = afterSetup();
    b.phase = 'build';
    b.hands = hands;
    b.homes = {};
    return b;
  }
  it('uses 4:1 at the bank, 3:1 at a general port and 2:1 at a matching port', () => {
    const b = building({ a: cards({ ore: 4 }), b: emptyHand() });
    expect(tradeRate(b, 'a', 'ore')).toBe(4);
    b.homes = { [ports.find((p) => p.kind === 'any')!.a]: { id: 'a', city: false } };
    expect(tradeRate(b, 'a', 'ore')).toBe(3);
    b.homes = { [ports.find((p) => p.kind === 'ore')!.a]: { id: 'a', city: false } };
    expect(tradeRate(b, 'a', 'ore')).toBe(2);
    move(b, 'a', { move: 'bank', give: 'ore', want: 'wool' });
    expect(b.hands.a).toEqual(cards({ ore: 2, wool: 1 }));
  });
  it('swaps one card each when an offer is accepted', () => {
    const b = building({ a: cards({ ore: 1 }), b: cards({ wool: 1 }) });
    move(b, 'a', { move: 'offer', give: 'ore', want: 'wool' });
    expect(() => move(b, 'a', { move: 'accept' })).toThrow('no offer');
    expect(() => move(b, 'a', { move: 'end' })).toThrow('Cancel the open offer');
    move(b, 'b', { move: 'accept' });
    expect(b.hands).toEqual({ a: cards({ wool: 1 }), b: cards({ ore: 1 }) });
    expect(b.offer).toBeNull();
  });
  it('trades several cards at once and keeps every card in play', () => {
    const b = building({ a: cards({ ore: 2, clay: 1 }), b: cards({ wool: 2 }) });
    const offer = (giveCards: unknown, wantCards: unknown) =>
      move(b, 'a', { move: 'offer', giveCards, wantCards });
    expect(() => offer(['ore', 'ore', 'ore'], ['wool'])).toThrow('more cards');
    expect(() => offer(['ore'], ['ore', 'wool'])).toThrow('different');
    expect(() => offer([], ['wool'])).toThrow('Choose cards');
    expect(() => offer(['ore'], [])).toThrow('Choose cards');
    expect(() => offer(['gold'], ['wool'])).toThrow('Choose cards');
    expect(() => offer(['ore'], Array(20).fill('wool'))).toThrow('too many');
    offer(['ore', 'ore', 'clay'], ['wool', 'wool']);
    move(b, 'b', { move: 'accept' });
    expect(b.hands).toEqual({ a: cards({ wool: 2 }), b: cards({ ore: 2, clay: 1 }) });
  });
  it('needs every card asked for', () => {
    const b = building({ a: cards({ ore: 1 }), b: cards({ wool: 1 }) });
    move(b, 'a', { move: 'offer', giveCards: ['ore'], wantCards: ['wool', 'wool'] });
    expect(() => move(b, 'b', { move: 'accept' })).toThrow('both cards');
    expect(b.hands.b).toEqual(cards({ wool: 1 }));
  });
  it('drops an offer saved in the old format', () => {
    const b = building({ a: cards({ ore: 1 }), b: cards({ wool: 1 }) });
    b.offer = { give: 'ore', want: 'wool' } as never;
    expect(() => move(b, 'b', { move: 'accept' })).toThrow('no offer');
    expect(b.offer).toBeNull();
  });
  it('needs the accepting player to hold the card', () => {
    const b = building({ a: cards({ ore: 1 }), b: emptyHand() });
    move(b, 'a', { move: 'offer', give: 'ore', want: 'wool' });
    expect(() => move(b, 'b', { move: 'accept' })).toThrow('both cards');
    move(b, 'a', { move: 'cancel' });
    expect(b.offer).toBeNull();
  });
});

describe('piece limits', () => {
  function rich() {
    const b = afterSetup();
    b.phase = 'build';
    b.homes = {};
    b.roads = {};
    b.hands.a = cards({ timber: 9, clay: 9, grain: 9, wool: 9, ore: 9 });
    return b;
  }
  it('stops at fifteen roads', () => {
    const b = rich();
    b.homes = { 0: { id: 'a', city: false } };
    for (let i = 0; i < limits.road - 1; i++) b.roads[locations(b, 'a', 'road')[0]] = 'a';
    expect(piecesLeft(b, 'a').road).toBe(1);
    move(b, 'a', { move: 'place', piece: 'road', index: locations(b, 'a', 'road')[0] });
    expect(piecesLeft(b, 'a').road).toBe(0);
    const free = edges.findIndex((_, i) => !b.roads[i]);
    expect(() => move(b, 'a', { move: 'place', piece: 'road', index: free })).toThrow('highlighted');
  });
  it('stops at five settlements until one becomes a city', () => {
    const b = rich();
    const spots: number[] = [];
    b.phase = 'settlement';
    while (spots.length < limits.settlement) {
      const v = locations(b, 'b', 'settlement')[0];
      spots.push(v);
      b.homes[v] = { id: 'a', city: false };
    }
    expect(locations(b, 'a', 'settlement')).toEqual([]);
    expect(locations(b, 'b', 'settlement').length).toBeGreaterThan(0);
    b.phase = 'build';
    move(b, 'a', { move: 'place', piece: 'city', index: spots[0] });
    expect(piecesLeft(b, 'a')).toMatchObject({ settlement: 1, city: limits.city - 1 });
    b.phase = 'settlement';
    expect(locations(b, 'a', 'settlement').length).toBeGreaterThan(0);
  });
  it('stops at four cities', () => {
    const b = rich();
    for (let v = 0; v < limits.city; v++) b.homes[v] = { id: 'a', city: true };
    b.homes[40] = { id: 'a', city: false };
    expect(() => move(b, 'a', { move: 'place', piece: 'city', index: 40 })).toThrow('highlighted');
  });
});

describe('bank', () => {
  function rollEight(homes: Record<number, { id: string; city: boolean }>, held: number) {
    const b = afterSetup();
    b.homes = homes;
    b.phase = 'roll';
    const r = tiles[eight].resource as keyof Hand;
    b.hands = { a: emptyHand(), b: cards({ [r]: held }) };
    rolls(4, 4);
    move(b, 'a', { move: 'roll' });
    return { b, r };
  }
  const eight = tiles.findIndex((t) => t.number === 8),
    [x, , y] = tiles[eight].vs;
  it('holds 19 of each resource', () => {
    const b = afterSetup();
    b.hands = { a: cards({ ore: 4 }), b: cards({ ore: 2, wool: 19 }) };
    expect(bankLeft(b)).toEqual({ timber: 19, clay: 19, grain: 19, wool: 0, ore: 13 });
  });
  it('gives a lone player what is left', () => {
    const { b, r } = rollEight({ [x]: { id: 'a', city: true } }, 18);
    expect([b.hands.a[r], bankLeft(b)[r]]).toEqual([1, 0]);
    expect(b.event).toContain('short');
  });
  it('gives nobody anything when several players are short', () => {
    const { b, r } = rollEight({ [x]: { id: 'a', city: true }, [y]: { id: 'b', city: false } }, 17);
    expect([b.hands.a[r], b.hands.b[r]]).toEqual([0, 17]);
  });
  it('cannot trade or hand out cards it does not have', () => {
    const b = afterSetup();
    b.phase = 'build';
    b.homes = {};
    b.hands = { a: cards({ ore: 4 }), b: cards({ wool: 18, clay: 19 }) };
    b.dev = { a: [{ kind: 'bounty', fresh: false }] };
    expect(() => move(b, 'a', { move: 'bank', give: 'ore', want: 'clay' })).toThrow('no Brick left');
    expect(() => move(b, 'a', { move: 'playDev', card: 'bounty', cards: ['wool', 'wool'] })).toThrow('bank');
    expect(b.dev.a).toHaveLength(1);
    move(b, 'a', { move: 'playDev', card: 'bounty', cards: ['wool', 'timber'] });
    expect(b.hands.a).toEqual(cards({ ore: 4, wool: 1, timber: 1 }));
  });
});

describe('development cards', () => {
  function turn(kinds: DevCard[], phase: 'roll' | 'build' = 'build') {
    const b = afterSetup();
    b.phase = phase;
    b.deck = [];
    b.hands = { a: emptyHand(), b: emptyHand() };
    b.dev = { a: kinds.map((kind) => ({ kind, fresh: false })) };
    return b;
  }
  it('come from a shuffled deck of 25', () => {
    const { deck } = startIsland(['a', 'b']);
    for (const kind of devCards) expect(deck!.filter((c) => c === kind)).toHaveLength(devDeck[kind]);
    expect(deck).toHaveLength(25);
  });
  it('cost one wheat, sheep and stone, and wait a turn before being played', () => {
    const b = turn([]);
    b.deck = ['knight'];
    expect(() => move(b, 'a', { move: 'buyDev' })).toThrow('more resources');
    b.hands.a = cards({ grain: 2, wool: 2, ore: 2 });
    move(b, 'a', { move: 'buyDev' });
    expect(b.hands.a).toEqual(cards({ grain: 1, wool: 1, ore: 1 }));
    expect(() => move(b, 'a', { move: 'buyDev' })).toThrow('no development cards left');
    expect(() => move(b, 'a', { move: 'playDev', card: 'knight' })).toThrow('cannot play');
    move(b, 'a', { move: 'end' });
    expect(() => move(b, 'a', { move: 'playDev', card: 'knight' })).toThrow('Wait for your turn');
    b.phase = 'build';
    move(b, 'b', { move: 'end' });
    move(b, 'a', { move: 'playDev', card: 'knight' });
    expect(b.phase).toBe('robber');
  });
  it('are limited to one a turn, and victory points are never played', () => {
    const b = turn(['bounty', 'monopoly', 'victory']);
    expect(() => move(b, 'a', { move: 'playDev', card: 'victory' })).toThrow('cannot play');
    expect(() => move(b, 'a', { move: 'playDev', card: 'gold' })).toThrow('cannot play');
    move(b, 'a', { move: 'playDev', card: 'bounty', cards: ['ore', 'ore'] });
    expect(() => move(b, 'a', { move: 'playDev', card: 'monopoly', resource: 'ore' })).toThrow('cannot play');
  });
  it('bounty gives two resources and is not spent on a bad choice', () => {
    const b = turn(['bounty'], 'roll');
    expect(() => move(b, 'a', { move: 'playDev', card: 'bounty', cards: ['ore'] })).toThrow('two resources');
    move(b, 'a', { move: 'playDev', card: 'bounty', cards: ['ore', 'wool'] });
    expect(b.hands.a).toEqual(cards({ ore: 1, wool: 1 }));
    expect([b.dev!.a, b.phase]).toEqual([[], 'roll']);
  });
  it('monopoly takes one resource from everyone', () => {
    const b = turn(['monopoly']);
    b.hands = { a: cards({ ore: 1 }), b: cards({ ore: 3, wool: 2 }) };
    move(b, 'a', { move: 'playDev', card: 'monopoly', resource: 'ore' });
    expect(b.hands).toEqual({ a: cards({ ore: 4 }), b: cards({ wool: 2 }) });
  });
  it('road building gives two free roads, even before rolling', () => {
    const b = turn(['roads'], 'roll');
    move(b, 'a', { move: 'playDev', card: 'roads' });
    expect(() => move(b, 'a', { move: 'roll' })).toThrow('free roads');
    const before = piecesLeft(b, 'a').road;
    for (let i = 0; i < 2; i++)
      move(b, 'a', { move: 'place', piece: 'road', index: locations(b, 'a', 'road')[0] });
    expect([before - piecesLeft(b, 'a').road, b.freeRoads, b.phase]).toEqual([2, 0, 'roll']);
    expect(() =>
      move(b, 'a', { move: 'place', piece: 'road', index: locations(b, 'a', 'road')[0] }),
    ).toThrow();
  });
  it('a knight before rolling returns to the roll, after stealing too', () => {
    const b = turn(['knight'], 'roll');
    b.hands.b = cards({ ore: 1 });
    const spot = tiles.findIndex(
      (t, i) =>
        i !== robberTile(b) &&
        t.vs.some((v) => b.homes[v]?.id === 'b') &&
        !t.vs.some((v) => b.homes[v]?.id === 'a'),
    );
    move(b, 'a', { move: 'playDev', card: 'knight' });
    move(b, 'a', { move: 'robber', index: spot });
    expect(b.phase).toBe('steal');
    move(b, 'a', { move: 'steal', target: 'b' });
    expect([b.phase, total(b.hands.a), b.resume]).toEqual(['roll', 1, undefined]);
  });
  it('three knights earn the strongest army, and only more knights take it', () => {
    const b = turn(['knight']);
    b.knights = { a: 2, b: 3 };
    b.strongestArmy = 'b';
    const points = pointsFor(b, 'b');
    move(b, 'a', { move: 'playDev', card: 'knight' });
    expect(b.strongestArmy).toBe('b');
    b.phase = 'build';
    b.devPlayed = false;
    b.dev = { a: [{ kind: 'knight', fresh: false }] };
    move(b, 'a', { move: 'playDev', card: 'knight' });
    expect([b.strongestArmy, pointsFor(b, 'b')]).toEqual(['a', points - 2]);
  });
  it('keep victory points out of the public score', () => {
    const b = turn(['victory', 'victory']);
    expect(totalPoints(b, 'a') - pointsFor(b, 'a')).toBe(2);
  });
});

describe('longest road', () => {
  // A path of roads that visits each corner once.
  function path(length: number) {
    const grow = (trail: number[], v: number, seen: Set<number>): number[] | null => {
      if (trail.length === length) return trail;
      for (const [i, e] of edges.entries()) {
        const w = e.a === v ? e.b : e.b === v ? e.a : -1;
        if (w < 0 || seen.has(w)) continue;
        const found = grow([...trail, i], w, new Set([...seen, w]));
        if (found) return found;
      }
      return null;
    };
    return grow([], 0, new Set([0]))!;
  }
  it('counts a trail, not branches, and is broken by an opponent', () => {
    const b = newIsland(['a', 'b']),
      trail = path(6);
    for (const i of trail.slice(0, 4)) b.roads[i] = 'a';
    expect([roadLength(b, 'a'), longestRoadOwner(b)]).toEqual([4, undefined]);
    for (const i of trail) b.roads[i] = 'a';
    expect([roadLength(b, 'a'), longestRoadOwner(b)]).toEqual([6, 'a']);
    const [x, y] = [edges[trail[2]], edges[trail[3]]];
    const middle = [x.a, x.b].find((v) => v === y.a || v === y.b)!;
    b.homes[middle] = { id: 'a', city: false };
    expect(roadLength(b, 'a')).toBe(6);
    b.homes[middle] = { id: 'b', city: false };
    expect([roadLength(b, 'a'), longestRoadOwner(b)]).toEqual([3, undefined]);
  });
  it('counts a full loop once', () => {
    const b = newIsland(['a', 'b']),
      { vs } = tiles[9];
    edges.forEach((e, i) => {
      if (vs.includes(e.a) && vs.includes(e.b)) b.roads[i] = 'a';
    });
    expect(roadLength(b, 'a')).toBe(6);
  });
  it('stays with its holder on a tie and is worth two points', () => {
    const b = newIsland(['a', 'b']);
    for (const i of path(5)) b.roads[i] = 'a';
    b.longestRoad = longestRoadOwner(b);
    expect([b.longestRoad, pointsFor(b, 'a')]).toEqual(['a', 2]);
    const { vs } = tiles[18];
    edges
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => vs.includes(e.a) && vs.includes(e.b))
      .slice(0, 5)
      .forEach(({ i }) => (b.roads[i] = 'b'));
    expect(roadLength(b, 'b')).toBe(5);
    expect(longestRoadOwner(b)).toBe('a');
    b.longestRoad = undefined;
    expect(longestRoadOwner(b)).toBeUndefined();
  });
});

describe('bots', () => {
  // Fixed seeds keep a failure reproducible.
  function seeded(seed: number) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Twenty-five whole games per table size take up to five seconds on a CI machine, the default limit.
  const gamesMs = 20_000;
  it.each([2, 3, 4])('finish legal games with %i players', { timeout: gamesMs }, (count) => {
    for (let seed = 1; seed <= 25; seed++) {
      vi.spyOn(Math, 'random').mockImplementation(seeded(seed));
      const ids = Array.from({ length: count }, (_, i) => 'p' + i),
        b = startIsland(ids);
      let steps = 0;
      while (!ids.some((id) => totalPoints(b, id) >= goal)) {
        expect(steps++, 'seed ' + seed).toBeLessThan(5000);
        const id = ids.find((id) => botMove(b, id));
        expect(id, 'nobody can move in ' + b.phase).toBeDefined();
        move(b, id!, botMove(b, id!)!);
        for (const hand of Object.values(b.hands))
          for (const n of Object.values(hand)) expect(n).toBeGreaterThanOrEqual(0);
        for (const n of Object.values(bankLeft(b))) expect(n).toBeGreaterThanOrEqual(0);
      }
      vi.restoreAllMocks();
    }
  });
});
