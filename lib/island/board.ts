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
export type Phase = 'settlement' | 'road' | 'roll' | 'harvest' | 'discard' | 'robber' | 'steal' | 'build';
export type Island = {
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
export type BoardView = Omit<Island, 'hands'> & { hand?: Hand; handSizes?: Record<string, number> };
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
export function pointsFor(b: BoardView, id: string) {
  return Object.values(b.homes).reduce((sum, h) => sum + (h.id === id ? (h.city ? 2 : 1) : 0), 0);
}

const coast = edges.filter((e) => tiles.filter((t) => t.vs.includes(e.a) && t.vs.includes(e.b)).length === 1);
const angle = (e: (typeof edges)[number]) =>
  Math.atan2(vertices[e.a].y + vertices[e.b].y, vertices[e.a].x + vertices[e.b].x);
coast.sort((a, b) => angle(a) - angle(b));
const kinds: (Resource | 'any')[] = ['any', 'grain', 'ore', 'any', 'clay', 'any', 'wool', 'timber', 'any'];
export const ports = kinds.map((kind, i) => ({ ...coast[Math.floor((i * coast.length) / 9)], kind }));
export const robberTile = (b: BoardView) => b.robber ?? tiles.findIndex((t) => t.resource === 'sand');
export function tradeRate(b: BoardView, id: string, give: Resource) {
  let rate = 4;
  for (const p of ports)
    if (b.homes[p.a]?.id === id || b.homes[p.b]?.id === id) {
      if (p.kind === give) return 2;
      if (p.kind === 'any') rate = 3;
    }
  return rate;
}
