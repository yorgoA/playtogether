export const resources = ['timber', 'clay', 'grain', 'wool', 'ore'] as const;
export type Resource = (typeof resources)[number];
export type Hand = Record<Resource, number>;
export const emptyHand = (): Hand => ({ timber: 0, clay: 0, grain: 0, wool: 0, ore: 0 });
export const costs = {
  road: { timber: 1, clay: 1 },
  settlement: { timber: 1, clay: 1, grain: 1, wool: 1 },
  city: { grain: 2, ore: 3 },
};
export type Piece = keyof typeof costs;
export const goal = 10;
export const devCost = { grain: 1, wool: 1, ore: 1 };
export const devCards = ['knight', 'roads', 'bounty', 'monopoly', 'victory'] as const;
export type DevCard = (typeof devCards)[number];
export const devDeck: Record<DevCard, number> = { knight: 14, roads: 2, bounty: 2, monopoly: 2, victory: 5 };
// A card bought this turn is fresh and cannot be played yet.
export type HeldCard = { kind: DevCard; fresh: boolean };
export const limits: Record<Piece, number> = { road: 15, settlement: 5, city: 4 };
export type Point = { x: number; y: number };
export const vertices: Point[] = [],
  edges: { a: number; b: number }[] = [];
export const tiles: { x: number; y: number; resource: Resource | 'sand'; number: number; vs: number[] }[] =
  [];
const terrain = [
  'timber',
  'grain',
  'wool',
  'clay',
  'ore',
  'timber',
  'clay',
  'wool',
  'grain',
  'sand',
  'timber',
  'ore',
  'grain',
  'clay',
  'wool',
  'grain',
  'ore',
  'timber',
  'wool',
] as const;
const numbers = [5, 8, 4, 2, 10, 9, 11, 6, 3, 0, 12, 5, 4, 8, 10, 9, 3, 6, 11];
const points = new Map<string, number>(),
  lines = new Set<string>();
for (let r = -2; r <= 2; r++)
  for (let q = Math.max(-2, -r - 2); q <= Math.min(2, -r + 2); q++) {
    const x = Math.sqrt(3) * 50 * (q + r / 2),
      y = 75 * r,
      vs: number[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = ((60 * i - 90) * Math.PI) / 180,
        px = x + 50 * Math.cos(angle),
        py = y + 50 * Math.sin(angle),
        key = Math.round(px * 100) + ',' + Math.round(py * 100);
      if (!points.has(key)) {
        points.set(key, vertices.length);
        vertices.push({ x: px, y: py });
      }
      vs.push(points.get(key)!);
    }
    vs.forEach((v, i) => {
      const w = vs[(i + 1) % 6],
        key = [Math.min(v, w), Math.max(v, w)].join('-');
      if (!lines.has(key)) {
        lines.add(key);
        edges.push({ a: v, b: w });
      }
    });
    const i = tiles.length;
    tiles.push({ x, y, vs, resource: terrain[i], number: numbers[i] });
  }
export type Phase =
  'order' | 'settlement' | 'road' | 'roll' | 'harvest' | 'discard' | 'robber' | 'steal' | 'build';
// What is shuffled between matches. The shape of the island never changes.
export type Layout = { terrain: (Resource | 'sand')[]; numbers: number[]; ports: (Resource | 'any')[] };
export type Island = {
  // Secret: what is left of the deck, and who holds which cards.
  deck?: DevCard[];
  dev?: Record<string, HeldCard[]>;
  devPlayed?: boolean;
  freeRoads?: number;
  // Where the turn continues after a knight moved the robber.
  resume?: 'roll' | 'build';
  knights?: Record<string, number>;
  longestRoad?: string;
  strongestArmy?: string;
  layout?: Layout;
  // Each player's totals in the roll-off for turn order, re-rolls included.
  orderRolls?: Record<string, number[]>;
  robber?: number;
  owed?: Record<string, number>;
  victims?: string[];
  rolledAt?: number;
  order: string[];
  turn: number;
  setup: number;
  phase: Phase;
  anchor: number;
  revision: number;
  homes: Record<number, { id: string; city: boolean }>;
  roads: Record<number, string>;
  dice: number[];
  event: string;
  offer: null | { give: Resource; want: Resource };
  hands: Record<string, Hand>;
};
export type BoardView = Omit<Island, 'hands' | 'deck' | 'dev'> & {
  hand?: Hand;
  handSizes?: Record<string, number>;
  devHand?: HeldCard[];
  devSizes?: Record<string, number>;
  deckLeft?: number;
};
export const active = (b: BoardView) => b.order[b.turn];
export const handSize = (hand: Hand) => Object.values(hand).reduce((sum, n) => sum + n, 0);
export function piecesBuilt(b: BoardView, id: string): Record<Piece, number> {
  const homes = Object.values(b.homes).filter((h) => h.id === id);
  return {
    road: Object.values(b.roads).filter((owner) => owner === id).length,
    settlement: homes.filter((h) => !h.city).length,
    city: homes.filter((h) => h.city).length,
  };
}
// Upgrading to a city hands the settlement piece back.
export function piecesLeft(b: BoardView, id: string): Record<Piece, number> {
  const built = piecesBuilt(b, id);
  return {
    road: limits.road - built.road,
    settlement: limits.settlement - built.settlement,
    city: limits.city - built.city,
  };
}
export function locations(b: BoardView, id: string, piece: Piece) {
  if (piecesLeft(b, id)[piece] <= 0) return [];
  const adjacent = (v: number) => edges.filter((e) => e.a === v || e.b === v);
  const touches = (v: number) => edges.some((e, i) => (e.a === v || e.b === v) && b.roads[i] === id);
  if (piece === 'city')
    return vertices.flatMap((_, i) => (b.homes[i]?.id === id && !b.homes[i].city ? [i] : []));
  if (piece === 'settlement')
    return vertices.flatMap((_, i) =>
      !b.homes[i] &&
      adjacent(i).every((e) => !b.homes[e.a === i ? e.b : e.a]) &&
      (b.phase === 'settlement' || touches(i))
        ? [i]
        : [],
    );
  const connects = (v: number) => (b.homes[v] ? b.homes[v].id === id : touches(v));
  return edges.flatMap((e, i) =>
    !b.roads[i] &&
    (b.phase === 'road' ? e.a === b.anchor || e.b === b.anchor : connects(e.a) || connects(e.b))
      ? [i]
      : [],
  );
}
export function affordable(hand: Hand, piece: Piece) {
  return Object.entries(costs[piece]).every(([k, n]) => hand[k as Resource] >= n);
}
export const affordsDev = (hand: Hand) => Object.entries(devCost).every(([k, n]) => hand[k as Resource] >= n);
// What everyone can see. Victory point cards stay hidden until they win the match.
export function pointsFor(b: BoardView, id: string) {
  return (
    Object.values(b.homes).reduce((sum, h) => sum + (h.id === id ? (h.city ? 2 : 1) : 0), 0) +
    (b.longestRoad === id ? 2 : 0) +
    (b.strongestArmy === id ? 2 : 0)
  );
}
export const secretPoints = (held: HeldCard[] = []) => held.filter((c) => c.kind === 'victory').length;
// The longest trail of a player's roads, using each once. Another player's building breaks it.
export function roadLength(b: BoardView, id: string) {
  const own = edges.flatMap((e, i) => (b.roads[i] === id ? [{ ...e, i }] : []));
  const used = new Set<number>();
  const walk = (v: number, first: boolean): number => {
    if (!first && b.homes[v] && b.homes[v].id !== id) return 0;
    let best = 0;
    for (const e of own) {
      if (used.has(e.i) || (e.a !== v && e.b !== v)) continue;
      used.add(e.i);
      best = Math.max(best, 1 + walk(e.a === v ? e.b : e.a, false));
      used.delete(e.i);
    }
    return best;
  };
  return Math.max(0, ...own.flatMap((e) => [walk(e.a, true), walk(e.b, true)]));
}
// Needs five roads. A holder keeps it on a tie; otherwise a tie leaves it with nobody.
export function longestRoadOwner(b: BoardView) {
  const lengths = b.order.map((id) => ({ id, n: roadLength(b, id) }));
  const best = Math.max(...lengths.map((l) => l.n));
  if (best < 5) return undefined;
  const top = lengths.filter((l) => l.n === best).map((l) => l.id);
  if (b.longestRoad && top.includes(b.longestRoad)) return b.longestRoad;
  return top.length === 1 ? top[0] : undefined;
}
export function playable(b: BoardView, id: string, held: HeldCard[] = [], kind: DevCard) {
  return (
    kind !== 'victory' &&
    active(b) === id &&
    (b.phase === 'roll' || b.phase === 'build') &&
    !b.offer &&
    !b.devPlayed &&
    !b.freeRoads &&
    held.some((c) => c.kind === kind && !c.fresh) &&
    (kind !== 'roads' || locations(b, id, 'road').length > 0)
  );
}

const coast = edges.filter((e) => tiles.filter((t) => t.vs.includes(e.a) && t.vs.includes(e.b)).length === 1);
const angle = (e: (typeof edges)[number]) =>
  Math.atan2(vertices[e.a].y + vertices[e.b].y, vertices[e.a].x + vertices[e.b].x);
coast.sort((a, b) => angle(a) - angle(b));
const kinds: (Resource | 'any')[] = ['any', 'grain', 'ore', 'any', 'clay', 'any', 'wool', 'timber', 'any'];
export const ports = kinds.map((kind, i) => ({ ...coast[Math.floor((i * coast.length) / 9)], kind }));
const layoutKey = (l: Layout) => l.terrain.join() + l.numbers.join() + l.ports.join();
const laidOut = new Map<string, { tiles: typeof tiles; ports: typeof ports }>();
function boardOf({ layout }: Pick<BoardView, 'layout'>) {
  if (!layout) return { tiles, ports };
  const key = layoutKey(layout);
  let found = laidOut.get(key);
  if (!found) {
    found = {
      tiles: tiles.map((t, i) => ({ ...t, resource: layout.terrain[i], number: layout.numbers[i] })),
      ports: ports.map((p, i) => ({ ...p, kind: layout.ports[i] })),
    };
    // Only a few matches matter at once; never grow without bound.
    if (laidOut.size > 50) laidOut.clear();
    laidOut.set(key, found);
  }
  return found;
}
export const tilesOf = (b: Pick<BoardView, 'layout'>) => boardOf(b).tiles;
export const portsOf = (b: Pick<BoardView, 'layout'>) => boardOf(b).ports;
const neighbours = tiles.map((t) =>
  tiles.flatMap((o, i) => (o !== t && o.vs.filter((v) => t.vs.includes(v)).length === 2 ? [i] : [])),
);
const shuffle = <T>(list: readonly T[]) => {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};
const hot = (n: number) => n === 6 || n === 8;
export const sixesApart = (placed: number[]) =>
  placed.every((n, i) => !hot(n) || neighbours[i].every((o) => !hot(placed[o])));
// New terrain, numbers and ports, with no two of the best numbers side by side.
export const shuffledDeck = () =>
  shuffle(devCards.flatMap((kind) => Array<DevCard>(devDeck[kind]).fill(kind)));
export function shuffledLayout(): Layout {
  const land = shuffle(terrain),
    desert = land.indexOf('sand'),
    portKinds = shuffle(kinds);
  for (let tries = 0; tries < 500; tries++) {
    const placed = shuffle(numbers.filter(Boolean));
    placed.splice(desert, 0, 0);
    if (sixesApart(placed)) return { terrain: land, numbers: placed, ports: portKinds };
  }
  return { terrain: [...terrain], numbers: [...numbers], ports: portKinds };
}
// Whoever still has to roll for turn order, in seat order. Ties roll again among themselves.
export function orderRollers(b: Pick<BoardView, 'order' | 'orderRolls'>) {
  const rolls = (id: string) => b.orderRolls?.[id] ?? [];
  return b.order.filter((id) =>
    b.order.some((other) => {
      if (other === id) return false;
      const [mine, theirs] = [rolls(id), rolls(other)];
      return mine.length <= theirs.length && mine.every((n, i) => n === theirs[i]);
    }),
  );
}
export const robberTile = (b: BoardView) => b.robber ?? tilesOf(b).findIndex((t) => t.resource === 'sand');
export function tradeRate(b: BoardView, id: string, give: Resource) {
  let rate = 4;
  for (const p of portsOf(b))
    if (b.homes[p.a]?.id === id || b.homes[p.b]?.id === id) {
      if (p.kind === give) return 2;
      if (p.kind === 'any') rate = 3;
    }
  return rate;
}
