import type { KingsView } from '../contract';
import { cupSips } from '../kings/rules';
import { GameError } from './games';

export type Kings = {
  deck: string[];
  left: boolean[];
  order: string[];
  turn: number;
  seq: number;
  phase: KingsView['phase'];
  card: string | null;
  slot: number;
  racers: string[];
  tapped: string[];
  mates: [string, string][];
  master: string | null;
  rules: { by: string; text: string }[];
  kings: number;
  event: KingsView['event'];
  // A race is decided by how fast each player tapped on their own phone, not by whose message came first.
  raceAt?: number;
  raceUntil?: number;
  times?: Record<string, number>;
  // Presses already counted.
  presses?: string[];
};
// How long the last phone may take after everyone else has tapped.
export const raceGraceMs = 3000;
// How much of a tap's delay we accept as a late start on that phone.
const raceAllowanceMs = 3000;
type Pour = { drinkers: string[]; amount: number } | null;

export function newKings(players: string[]): Kings {
  const deck = [...'A23456789TJQK'].flatMap((rank) => [...'SHDC'].map((suit) => rank + suit));
  for (let index = deck.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[other]] = [deck[other], deck[index]];
  }
  return {
    deck,
    left: deck.map(() => true),
    order: players,
    turn: 0,
    seq: 0,
    phase: 'draw',
    card: null,
    slot: -1,
    racers: [],
    tapped: [],
    mates: [],
    master: null,
    rules: [],
    kings: 0,
    event: null,
  };
}

// Mates drink together, and so do the mates of mates.
function pour(board: Kings, ids: string[], amount: number, caught = false): Pour {
  const drinkers = new Set(ids);
  for (const id of drinkers)
    for (const [a, b] of board.mates) {
      if (a === id) drinkers.add(b);
      if (b === id) drinkers.add(a);
    }
  board.event = { drinkers: [...drinkers], amount, caught };
  return { drinkers: [...drinkers], amount };
}

function draw(board: Kings, player: string, slot: unknown, connected: string[], now: number): Pour {
  if (typeof slot !== 'number' || !board.left[slot]) throw new GameError('That card is already gone.');
  board.left[slot] = false;
  board.slot = slot;
  board.card = board.deck[slot];
  board.seq++;
  board.tapped = [];
  clearRace(board);
  board.event = null;
  board.phase = 'open';
  switch (board.card[0]) {
    case 'A':
      return pour(board, connected, 1);
    case '3':
      return pour(board, [player], 1);
    case '2':
    case '8':
    case '9':
    case 'T':
      board.phase = 'pick';
      return null;
    case '4':
    case '7':
      board.racers = connected;
      if (connected.length > 1) {
        board.phase = 'race';
        board.raceAt = now;
      }
      return null;
    case 'Q':
      board.master = player;
      return null;
    case 'K':
      board.kings++;
      if (board.kings === 4) return pour(board, [player], cupSips);
      board.phase = 'rule';
      return null;
    default:
      board.phase = 'honor';
      return null;
  }
}

export function kingsMove(
  board: Kings,
  player: string,
  command: Record<string, unknown>,
  connected: string[],
  now: number,
): Pour {
  const { move, target, text, press } = command;
  if (move === 'catch' && typeof press === 'string' && board.presses?.includes(press)) return null;
  if (command.seq !== board.seq) throw new GameError('The table has moved on.', 409);
  const mine = board.order[board.turn] === player;
  const other = () => {
    if (typeof target !== 'string' || target === player || !board.order.includes(target))
      throw new GameError('Choose another player.');
    return target;
  };
  if (move === 'catch') {
    if (board.master !== player) throw new GameError('Only the question master can catch players.');
    const caught = other();
    if (typeof press === 'string') board.presses = [...(board.presses ?? []), press].slice(-30);
    return pour(board, [caught], 1, true);
  }
  if (move === 'tap' && board.phase === 'race' && board.racers.includes(player)) {
    if (board.tapped.includes(player)) return null;
    const elapsed = now - (board.raceAt ?? now);
    const reported = typeof command.ms === 'number' && Number.isFinite(command.ms) ? command.ms : elapsed;
    const ms = Math.min(elapsed, Math.max(reported, elapsed - raceAllowanceMs));
    board.times = { ...board.times, [player]: ms };
    board.tapped.push(player);
    const rest = board.racers.length - board.tapped.length;
    if (rest === 0) return finishRace(board);
    if (rest === 1) board.raceUntil ??= now + raceGraceMs;
    return null;
  }
  if (move === 'drank' && board.phase === 'honor') {
    if (board.tapped.includes(player)) return null;
    const before = board.event?.drinkers ?? [];
    const drinkers = pour(board, [player], 1)!.drinkers.filter((id) => !board.tapped.includes(id));
    board.tapped.push(...drinkers);
    board.event = { drinkers: [...new Set([...before, ...drinkers])], amount: 1, caught: false };
    return { drinkers, amount: 1 };
  }
  if (!mine) throw new GameError('It is not your turn.', 409);
  if (move === 'draw' && board.phase === 'draw') return draw(board, player, command.slot, connected, now);
  if (move === 'pick' && board.phase === 'pick') {
    // The player who drew can also be the one who failed a rhyme or category.
    const self = target === player && (board.card![0] === '9' || board.card![0] === 'T');
    const chosen = self ? player : other();
    board.phase = 'open';
    if (board.card![0] !== '8') return pour(board, [chosen], 1);
    board.mates.push([player, chosen]);
    return null;
  }
  if (move === 'rule' && board.phase === 'rule') {
    const rule = typeof text === 'string' ? text.trim().slice(0, 60) : '';
    if (!rule) throw new GameError('Write a house rule.');
    board.rules.push({ by: player, text: rule });
    board.phase = 'open';
    return null;
  }
  if (move === 'done' && (board.phase === 'open' || board.phase === 'honor')) {
    nextKings(board);
    return null;
  }
  throw new GameError('That move is not available now.', 409);
}

function clearRace(board: Kings) {
  board.racers = [];
  board.raceAt = board.raceUntil = board.times = undefined;
}
// Whoever never tapped drinks; when everyone did, the slowest does.
function finishRace(board: Kings): Pour {
  const missing = board.racers.filter((id) => !board.tapped.includes(id));
  const slowest = Math.max(...board.tapped.map((id) => board.times?.[id] ?? 0));
  const losers = missing.length ? missing : board.tapped.filter((id) => (board.times?.[id] ?? 0) === slowest);
  board.phase = 'open';
  return pour(board, losers, 1);
}
// Ends a race whose last player ran out of time.
export function settleRace(board: Kings, now: number): Pour {
  if (board.phase !== 'race' || board.raceUntil === undefined || now < board.raceUntil) return null;
  return finishRace(board);
}
export function resumeKings(board: Kings, delta: number) {
  if (board.raceAt !== undefined) board.raceAt += delta;
  if (board.raceUntil !== undefined) board.raceUntil += delta;
}

// Once the fourth king has been drunk the game is over.
export const kingsOver = (board: Kings) => board.kings === 4 && board.phase === 'draw';

export function nextKings(board: Kings) {
  board.turn = (board.turn + 1) % board.order.length;
  clearCard(board);
}
function clearCard(board: Kings) {
  board.seq++;
  board.phase = 'draw';
  board.card = null;
  board.slot = -1;
  clearRace(board);
  board.tapped = [];
}

export function leaveKings(board: Kings, player: string) {
  const seat = board.order.indexOf(player);
  if (seat < 0) return;
  const current = seat === board.turn;
  board.order = board.order.filter((id) => id !== player);
  board.mates = board.mates.filter((pair) => !pair.includes(player));
  board.rules = board.rules.filter((rule) => rule.by !== player);
  board.racers = board.racers.filter((id) => id !== player);
  board.tapped = board.tapped.filter((id) => id !== player);
  if (board.master === player) board.master = null;
  if (board.event) board.event.drinkers = board.event.drinkers.filter((id) => id !== player);
  if (seat < board.turn) board.turn--;
  if (board.turn >= board.order.length) board.turn = 0;
  if (current) clearCard(board);
  else if (board.phase === 'race' && board.racers.filter((id) => !board.tapped.includes(id)).length < 2)
    board.phase = 'open';
  if (board.phase !== 'race') board.raceUntil = undefined;
}

export function kingsView(board: Kings): KingsView {
  const { left, order, seq, phase, card, slot, racers, tapped, mates, master, rules, kings, event } = board;
  return {
    left,
    turn: order[board.turn] ?? '',
    order,
    seq,
    phase,
    card,
    slot,
    racers,
    tapped,
    mates,
    master,
    rules,
    kings,
    event,
  };
}
