import type { PyramidView } from '../contract';
import type { GameModule } from './engine';
import { GameError } from './games';

import { pyramidLevels } from '../pyramid/layout';
type Claim = NonNullable<PyramidView['claim']> & { slot: number };
type Outcome = NonNullable<PyramidView['outcome']>;

export type Pyramid = {
  cards: string[];
  hands: Record<string, (string | null)[]>;
  index: number;
  claim: Claim | null;
  outcome: Outcome | null;
  // Who is still at the table, and the sips each player owes. Matches started before these were kept have
  // neither, so they fall back to the hands and to no sips.
  players?: string[];
  sips?: Record<string, number>;
};

function newPyramid(players: string[]): Pyramid {
  const deck = [...'A23456789TJQK'].flatMap((rank) => [...'SHDC'].map((suit) => rank + suit));
  for (let index = deck.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[other]] = [deck[other], deck[index]];
  }
  return {
    cards: deck.slice(0, 15),
    hands: Object.fromEntries(players.map((id, index) => [id, deck.slice(15 + index * 4, 19 + index * 4)])),
    index: -1,
    claim: null,
    outcome: null,
    players,
    sips: {},
  };
}

function flipPyramid(board: Pyramid, index: unknown) {
  if (index !== board.index || board.claim) throw new GameError('Wait for the current card to finish.', 409);
  board.index++;
  board.outcome = null;
}

function claimPyramid(
  board: Pyramid,
  from: string,
  to: unknown,
  slot: unknown,
  index: unknown,
  players: string[],
) {
  if (index !== board.index || !board.cards[board.index] || board.claim)
    throw new GameError('This card is closed.', 409);
  if (typeof to !== 'string' || from === to || !players.includes(to))
    throw new GameError('Choose another connected player.');
  if (typeof slot !== 'number' || !Number.isInteger(slot) || !board.hands[from]?.[slot])
    throw new GameError('Choose an unused card from your hand.');
  board.outcome = null;
  board.claim = { from, to, slot };
}

function resolvePyramid(board: Pyramid, player: string, call: boolean, index: unknown) {
  const claim = board.claim;
  if (index !== board.index || claim?.to !== player)
    throw new GameError('This claim is no longer waiting for you.', 409);
  const card = board.hands[claim.from][claim.slot]!;
  const match = card[0] === board.cards[board.index][0];
  let end = 0;
  const level = pyramidLevels.findIndex((size) => board.index < (end += size)) + 1;
  board.hands[claim.from][claim.slot] = null;
  board.outcome = {
    from: claim.from,
    to: claim.to,
    loser: call && !match ? claim.from : claim.to,
    // Calling doubles the sips, whoever turns out to be wrong.
    points: call ? level * 2 : level,
    verdict: call ? (match ? 'match' : 'bluff') : 'accepted',
    ...(call ? { card } : {}),
  };
  board.claim = null;
  return board.outcome;
}

function pyramidView(board: Pyramid, player?: string): PyramidView {
  const hand = player ? board.hands[player] : undefined;
  return {
    index: board.index,
    cards: board.cards.map((card, index) => (index <= board.index ? card : null)),
    claim: board.claim ? { from: board.claim.from, to: board.claim.to } : null,
    outcome: board.outcome,
    hand: hand && board.index < 0 ? hand.filter((card): card is string => card !== null) : undefined,
    slots: hand?.map(Boolean),
  };
}

// The host turns the cards. A player claims a match with a card from their hand against another player, who
// accepts or calls the bluff. Scores are the sips owed, as negative points, shown while the match goes on.
export const pyramidModule: GameModule<Pyramid, PyramidView> = {
  game: 'pyramid',
  action: ['pyramidClaim', 'pyramidReply'],
  key: 'pyramid',
  liveScores: true,
  start: (players) => newPyramid(players),
  move(board, playerId, command, ctx) {
    if (command.action === 'pyramidClaim')
      claimPyramid(board, playerId, command.target, command.slot, command.index, ctx.connected);
    else {
      const { loser, points } = resolvePyramid(board, playerId, command.call === true, command.index);
      board.sips = { ...board.sips, [loser]: (board.sips?.[loser] ?? 0) + points };
    }
  },
  host: { action: 'pyramidFlip', move: (board, command) => flipPyramid(board, command.index) },
  leave(board, playerId) {
    const claim = board.claim;
    if (claim && (claim.from === playerId || claim.to === playerId)) board.claim = null;
    board.players = (board.players ?? Object.keys(board.hands)).filter((id) => id !== playerId);
  },
  over: (board) =>
    board.index === board.cards.length || (board.players ?? Object.keys(board.hands)).length < 2,
  score: (board, playerId) => 0 - (board.sips?.[playerId] ?? 0),
  view: (board, viewer) => pyramidView(board, viewer.id),
};
