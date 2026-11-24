import {
  tradeRate,
  robberTile,
  active,
  affordable,
  affordsDev,
  devCost,
  playable,
  costs,
  edges,
  locations,
  resources,
  tilesOf,
  type DevCard,
  type Island,
  type Piece,
  type Resource,
} from '../island/board';

function landValue(board: Island, id: string, index: number) {
  const existing = new Set(
    tilesOf(board)
      .filter((t) => t.vs.some((v) => board.homes[v]?.id === id))
      .map((t) => t.resource),
  );
  return tilesOf(board)
    .filter((t) => t.vs.includes(index) && t.number)
    .reduce((sum, t) => sum + (6 - Math.abs(7 - t.number)) * (existing.has(t.resource) ? 1 : 1.5), 0);
}
export function botMove(board: Island, id: string) {
  const hand = board.hands[id];
  if (board.phase === 'discard') {
    const n = board.owed?.[id] ?? 0;
    if (!n) return null;
    const remaining = { ...hand },
      cards: Resource[] = [];
    while (cards.length < n) {
      const k = [...resources].sort((a, b) => remaining[b] - remaining[a])[0];
      cards.push(k);
      remaining[k]--;
    }
    return { move: 'discard', cards };
  }
  if (active(board) !== id) {
    const offer = board.offer;
    return offer && hand[offer.want] > 0 && hand[offer.want] > hand[offer.give] ? { move: 'accept' } : null;
  }
  function place(piece: Piece, choices: number[]) {
    const score = (index: number) => {
      if (piece !== 'road') return landValue(board, id, index);
      const { a, b } = edges[index];
      const free = [a, b].filter(
        (v) => !board.homes[v] && !edges.some((e, i) => (e.a === v || e.b === v) && board.roads[i] === id),
      );
      return free.reduce((sum, v) => sum + 2 + landValue(board, id, v), 0);
    };
    return { move: 'place', piece, index: choices.sort((a, b) => score(b) - score(a))[0] };
  }
  const phase = board.phase;
  if (phase === 'settlement' || phase === 'road') return place(phase, locations(board, id, phase));
  if (phase === 'robber') {
    const choices = tilesOf(board)
      .map((t, index) => ({
        index,
        value:
          t.vs.reduce((n, v) => n + (board.homes[v] ? (board.homes[v].id === id ? -4 : 2) : 0), 0) *
          (6 - Math.abs(7 - t.number)),
      }))
      .filter((t) => t.index !== robberTile(board));
    return { move: 'robber', index: choices.sort((a, b) => b.value - a.value)[0].index };
  }
  if (phase === 'steal') return { move: 'steal', target: board.victims![0] };
  if (board.freeRoads) {
    const choices = locations(board, id, 'road');
    return choices.length ? place('road', choices) : { move: 'skipRoads' };
  }
  const can = (kind: DevCard) => playable(board, id, board.dev?.[id], kind);
  if (phase === 'roll' || phase === 'order') {
    const blocked = tilesOf(board)[robberTile(board)].vs.some((v) => board.homes[v]?.id === id);
    return phase === 'roll' && blocked && can('knight')
      ? { move: 'playDev', card: 'knight' }
      : { move: 'roll' };
  }
  const options = (['city', 'settlement', 'road'] as Piece[])
    .map((piece) => ({ piece, choices: locations(board, id, piece) }))
    .filter((o) => o.choices.length);
  if (phase === 'build') {
    for (const { piece, choices } of options)
      if (piece !== 'road' && affordable(hand, piece)) return place(piece, choices);
    if (can('knight')) return { move: 'playDev', card: 'knight' };
    if (can('roads')) return { move: 'playDev', card: 'roads' };
    const low = [...resources].sort((a, b) => hand[a] - hand[b]);
    if (can('bounty')) return { move: 'playDev', card: 'bounty', cards: low.slice(0, 2) };
    if (can('monopoly')) return { move: 'playDev', card: 'monopoly', resource: low[0] };
    if (board.deck?.length && affordsDev(hand)) return { move: 'buyDev' };
    for (const { piece, choices } of options) if (affordable(hand, piece)) return place(piece, choices);
  }
  const cost = (piece: Piece, r: Resource) =>
    Number((costs[piece] as Partial<Record<Resource, number>>)[r] ?? 0);
  const missing = (piece: Piece) => resources.reduce((n, r) => n + Math.max(0, cost(piece, r) - hand[r]), 0);
  options.sort((a, b) => missing(a.piece) - missing(b.piece));
  // With nothing left to build, save for development cards.
  const aim = options[0]?.piece;
  const needs = (r: Resource) =>
    aim ? cost(aim, r) : Number((devCost as Partial<Record<Resource, number>>)[r] ?? 0);
  const spare = (r: Resource) => hand[r] - needs(r);
  const ranked = [...resources].sort((a, b) => spare(a) - spare(b));
  const want = ranked[0],
    give = ranked[ranked.length - 1];
  if (phase === 'harvest') return { move: 'harvest', resource: want };
  if (spare(want) < 0 && spare(give) >= tradeRate(board, id, give)) return { move: 'bank', give, want };
  return { move: 'end' };
}
