import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  active,
  edges,
  emptyHand,
  limits,
  locations,
  piecesLeft,
  pointsFor,
  ports,
  portsOf,
  robberTile,
  shuffledLayout,
  sixesApart,
  tiles,
  tilesOf,
  tradeRate,
  vertices,
  type Hand,
  type Island,
} from '../lib/island/board';
import { islandMove, newIsland, startIsland } from '../lib/server/island';
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
  it.each([2, 3, 4])('finish legal games with %i players', (count) => {
    for (let seed = 1; seed <= 25; seed++) {
      vi.spyOn(Math, 'random').mockImplementation(seeded(seed));
      const ids = Array.from({ length: count }, (_, i) => 'p' + i),
        b = startIsland(ids);
      let steps = 0;
      while (!ids.some((id) => pointsFor(b, id) >= 6)) {
        expect(steps++, 'seed ' + seed).toBeLessThan(5000);
        const id = ids.find((id) => botMove(b, id));
        expect(id, 'nobody can move in ' + b.phase).toBeDefined();
        move(b, id!, botMove(b, id!)!);
        for (const hand of Object.values(b.hands))
          for (const n of Object.values(hand)) expect(n).toBeGreaterThanOrEqual(0);
      }
      vi.restoreAllMocks();
    }
  });
});
