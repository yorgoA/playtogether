import type { StormView } from '../contract';
import { elements, fits, highest, isPower, stormLimit } from '../storm/rules';
import { GameError } from './games';

export type Storm = {
  order: string[];
  turn: string;
  seq: number;
  hands: Record<string, string[]>;
  deck: string[];
  spent: string[];
  piles: [string, string];
  // The pile a streak is running on, once the turn's first card is down.
  streak: number | null;
  storm: number;
  // Turns in a row that drew from an empty deck. A full circle of them ends the match.
  stuck: number;
  event: StormView['event'];
};
export const handStart = 7;
export const turnMs = 40_000;

function shuffle(cards: string[]) {
  for (let i = cards.length - 1; i > 0; i--) {
    const other = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[other]] = [cards[other], cards[i]];
  }
  return cards;
}
const numbered = () =>
  Object.keys(elements).flatMap((e) => Array.from({ length: highest }, (_, i) => e + (i + 1)));

export function newStorm(players: string[]): Storm {
  const deck = shuffle([...numbered(), ...numbered(), ...Array(6).fill('G'), ...Array(4).fill('C')]);
  const take = () =>
    deck.splice(
      deck.findIndex((card) => !isPower(card)),
      1,
    )[0];
  const piles: [string, string] = [take(), take()];
  const order = shuffle([...players]);
  return {
    order,
    turn: order[0],
    seq: 0,
    hands: Object.fromEntries(order.map((id) => [id, deck.splice(0, handStart)])),
    deck,
    spent: [],
    piles,
    streak: null,
    storm: 0,
    stuck: 0,
    event: null,
  };
}

function deal(s: Storm, id: string, count: number) {
  for (let i = 0; i < count; i++) {
    if (!s.deck.length) s.deck = shuffle(s.spent.splice(0));
    const card = s.deck.pop();
    if (!card) return i;
    s.hands[id].push(card);
  }
  return count;
}
function pass(s: Storm) {
  s.turn = s.order[(s.order.indexOf(s.turn) + 1) % s.order.length];
  s.streak = null;
}
// Drawing feeds the storm. When it breaks, it soaks whoever is closest to winning.
function drawCard(s: Storm) {
  const drawn = deal(s, s.turn, 1);
  s.stuck = drawn ? 0 : s.stuck + 1;
  s.event = { kind: 'draw', by: s.turn, card: null, pile: null, to: null, hit: [] };
  if (++s.storm >= stormLimit) {
    s.storm = 0;
    const least = Math.min(...s.order.map((id) => s.hands[id].length));
    s.event.hit = s.order.filter((id) => s.hands[id].length === least);
    for (const id of s.event.hit) deal(s, id, 2);
  }
  pass(s);
}

export function stormMove(s: Storm, id: string, command: Record<string, unknown>) {
  if (command.seq !== s.seq) throw new GameError('The table has moved on.', 409);
  if (s.turn !== id) throw new GameError('Wait for your turn.', 409);
  const hand = s.hands[id];
  if (command.move === 'draw') {
    if (s.streak !== null) throw new GameError('Keep your streak going or end your turn.');
    drawCard(s);
  } else if (command.move === 'end') {
    if (s.streak === null) throw new GameError('Play a card or draw one.');
    pass(s);
  } else if (command.move === 'play') {
    const card = command.card as string;
    const at = hand.indexOf(card);
    if (at < 0) throw new GameError('Choose a card from your hand.');
    if (isPower(card)) {
      if (s.streak !== null) throw new GameError('Only neighbours continue a streak.');
      const to = command.target;
      const gift = hand.filter((_, i) => i !== at).indexOf(command.give as string);
      const gives = card === 'G' && hand.length > 1;
      if (gives && (typeof to !== 'string' || to === id || !s.order.includes(to)))
        throw new GameError('Choose another player.');
      if (gives && gift < 0) throw new GameError('Choose a card to blow away.');
      hand.splice(at, 1);
      if (gives) s.hands[to as string].push(...hand.splice(gift, 1));
      if (card === 'C') s.storm = 0;
      s.spent.push(card);
      s.event = { kind: 'play', by: id, card, pile: null, to: gives ? (to as string) : null, hit: [] };
      pass(s);
    } else {
      const pile = command.pile;
      if (pile !== 0 && pile !== 1) throw new GameError('Choose a pile.');
      if (s.streak !== null && pile !== s.streak) throw new GameError('A streak stays on one pile.');
      if (!fits(card, s.piles[pile], s.streak !== null)) throw new GameError('That card does not fit.');
      hand.splice(at, 1);
      s.spent.push(s.piles[pile]);
      s.piles[pile] = card;
      s.streak = pile;
      s.event = { kind: 'play', by: id, card, pile, to: null, hit: [] };
      if (!hand.some((next) => fits(next, card, true))) pass(s);
    }
    s.stuck = 0;
  } else throw new GameError('Choose a move.');
  s.seq++;
}

// Plays for someone who ran out of time.
export function stormTimeout(s: Storm) {
  if (s.streak === null) drawCard(s);
  else pass(s);
  s.seq++;
}

export const stormOver = (s: Storm) =>
  s.order.length < 2 || s.order.some((id) => !s.hands[id].length) || s.stuck >= s.order.length;

// Ten points for emptying your hand, and one fewer for every card left in it.
export const stormScore = (s: Storm, id: string) => Math.max(0, 10 - (s.hands[id]?.length ?? 10));

export function leaveStorm(s: Storm, id: string) {
  if (s.turn === id) pass(s);
  s.order = s.order.filter((other) => other !== id);
  s.spent.push(...(s.hands[id] ?? []));
  delete s.hands[id];
  s.stuck = 0;
  s.seq++;
}

export function stormView(s: Storm, viewer?: string): StormView {
  return {
    order: s.order,
    turn: s.turn,
    seq: s.seq,
    piles: s.piles,
    streak: s.streak,
    storm: s.storm,
    event: s.event,
    sizes: Object.fromEntries(s.order.map((id) => [id, s.hands[id].length])),
    hand: viewer ? s.hands[viewer] : undefined,
  };
}
