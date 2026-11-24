import {
  robberTile,
  tradeRate,
  active,
  affordable,
  bankSize,
  covers,
  handSize,
  resourceNames,
  toHand,
  affordsDev,
  devCards,
  devCost,
  longestRoadOwner,
  playable,
  pointsFor,
  secretPoints,
  shuffledDeck,
  costs,
  emptyHand,
  locations,
  resources,
  orderRollers,
  shuffledLayout,
  tilesOf,
  type DevCard,
  type Island,
  type Hand,
  type Resource,
  type Piece,
} from '../island/board';
import { GameError } from './games';
export function newIsland(order: string[]): Island {
  return {
    order,
    turn: 0,
    setup: 0,
    phase: 'settlement',
    anchor: -1,
    revision: 0,
    homes: {},
    roads: {},
    dice: [],
    event: 'Choose the first settlement on your phone.',
    offer: null,
    hands: Object.fromEntries(order.map((id) => [id, emptyHand()])),
  };
}
// A real match: a fresh map, and a roll-off for who goes first.
export function startIsland(order: string[]): Island {
  return {
    ...newIsland(order),
    layout: shuffledLayout(),
    phase: 'order',
    orderRolls: {},
    deck: shuffledDeck(),
    dev: {},
    knights: {},
    event: 'Everyone rolls. The highest roll starts.',
  };
}
export function bankLeft(b: Island) {
  const left = emptyHand();
  for (const r of resources)
    left[r] = bankSize - Object.values(b.hands).reduce((sum, hand) => sum + hand[r], 0);
  return left;
}
export const totalPoints = (b: Island, id: string) => pointsFor(b, id) + secretPoints(b.dev?.[id]);
export function islandMove(b: Island, id: string, name: string, c: Record<string, unknown>) {
  const reject = (msg: string): never => {
    throw new GameError(msg, 409);
  };
  // An offer left open by an earlier version, before offers could hold several cards.
  if (typeof b.offer?.give === 'string') b.offer = null;
  if (c.revision !== b.revision) reject('The board changed. Choose your move again.');
  const mine = id === active(b),
    hand = b.hands[id];
  const isResource = (x: unknown): x is Resource => resources.includes(x as Resource);
  if (c.move === 'discard' && b.phase === 'discard') {
    const count = b.owed?.[id] ?? 0;
    if (!count || !Array.isArray(c.cards) || c.cards.length !== count || !c.cards.every(isResource))
      return reject('Choose the required cards.');
    const used = emptyHand();
    for (const r of c.cards as Resource[]) used[r]++;
    if (resources.some((r) => used[r] > hand[r])) return reject('Choose cards from your hand.');
    for (const r of resources) hand[r] -= used[r];
    delete b.owed![id];
    if (!Object.keys(b.owed!).length) b.phase = 'robber';
  } else if (c.move === 'accept') {
    if (mine || !b.offer || b.phase !== 'build') return reject('There is no offer to accept.');
    const { give, want } = b.offer,
      other = b.hands[active(b)];
    if (!covers(hand, want) || !covers(other, give)) return reject('The trade needs both cards.');
    for (const r of resources) {
      other[r] += want[r] - give[r];
      hand[r] += give[r] - want[r];
    }
    b.offer = null;
    b.event = name + ' accepted the trade.';
  } else {
    if (!mine) return reject('Wait for your turn.');
    if (b.offer && c.move !== 'cancel') return reject('Cancel the open offer first.');
    if (c.move === 'place') {
      const piece = c.piece as Piece,
        index = c.index as number,
        setup = b.phase === 'settlement' || b.phase === 'road';
      if (
        !Object.hasOwn(costs, piece) ||
        !Number.isInteger(index) ||
        !(setup ? piece === b.phase : b.freeRoads ? piece === 'road' : b.phase === 'build') ||
        !locations(b, id, piece).includes(index)
      )
        return reject('Choose a highlighted location.');
      if (b.freeRoads) b.freeRoads--;
      else if (!setup) {
        if (!affordable(hand, piece)) return reject('You need more resources.');
        for (const [r, n] of Object.entries(costs[piece])) hand[r as Resource] -= n;
      }
      if (piece === 'road') b.roads[index] = id;
      else b.homes[index] = { id, city: piece === 'city' };
      b.event = name + ' built a ' + piece + '.';
      if (b.freeRoads && !locations(b, id, 'road').length) b.freeRoads = 0;
      if (piece !== 'city') {
        const before = b.longestRoad;
        b.longestRoad = longestRoadOwner(b);
        if (b.longestRoad === id && before !== id) b.event += ' They take the longest road!';
        else if (before && before !== b.longestRoad) b.event += ' The longest road is broken!';
      }
      if (b.phase === 'settlement') {
        b.anchor = index;
        b.phase = 'road';
        if (b.setup >= b.order.length)
          for (const t of tilesOf(b)) if (t.vs.includes(index) && t.resource !== 'sand') hand[t.resource]++;
      } else if (b.phase === 'road') {
        b.setup++;
        const n = b.order.length;
        b.turn = b.setup < n ? b.setup : Math.max(0, 2 * n - 1 - b.setup);
        b.phase = b.setup === 2 * n ? 'roll' : 'settlement';
      }
    } else if (c.move === 'roll' && b.phase === 'order') {
      b.dice = Array.from({ length: 2 }, () => Math.floor(Math.random() * 6) + 1);
      b.rolledAt = Date.now();
      const sum = b.dice[0] + b.dice[1],
        rolls = (b.orderRolls ??= {});
      (rolls[id] ??= []).push(sum);
      const waiting = orderRollers(b);
      b.event = name + ' rolled ' + sum + ' for turn order.';
      if (waiting.length) {
        // First rolls come before any re-roll.
        const next = waiting.find((p) => !rolls[p]) ?? waiting[0];
        if (rolls[next]) b.event += ' A tie! Those players roll again.';
        b.turn = b.order.indexOf(next);
      } else {
        b.order.sort((x, y) => {
          const i = rolls[x].findIndex((n, k) => n !== rolls[y][k]);
          return rolls[y][i] - rolls[x][i];
        });
        b.turn = 0;
        b.phase = 'settlement';
        b.event += ' The highest roll starts.';
      }
    } else if (b.freeRoads && c.move !== 'cancel') {
      // Only roads can be placed until both free ones are down, or the rest are given up.
      if (c.move !== 'skipRoads') return reject('Place your free roads first.');
      b.freeRoads = 0;
    } else if (c.move === 'buyDev' && b.phase === 'build') {
      if (!b.deck?.length) return reject('There are no development cards left.');
      if (!affordsDev(hand)) return reject('You need more resources.');
      for (const [r, n] of Object.entries(devCost)) hand[r as Resource] -= n;
      ((b.dev ??= {})[id] ??= []).push({ kind: b.deck.pop()!, fresh: true });
      b.event = name + ' bought a development card.';
    } else if (c.move === 'playDev') {
      const kind = c.card as DevCard,
        held = b.dev?.[id] ?? [];
      if (!devCards.includes(kind) || !playable(b, id, held, kind))
        return reject('You cannot play that card now.');
      if (kind === 'bounty') {
        if (!Array.isArray(c.cards) || c.cards.length !== 2 || !c.cards.every(isResource))
          return reject('Choose two resources.');
        if (!covers(bankLeft(b), toHand(c.cards as Resource[])))
          return reject('The bank does not have those cards.');
        for (const r of c.cards as Resource[]) hand[r]++;
        b.event = name + ' took two resources from the bank.';
      } else if (kind === 'monopoly') {
        if (!isResource(c.resource)) return reject('Choose a resource.');
        let taken = 0;
        for (const other of b.order) {
          if (other === id) continue;
          taken += b.hands[other][c.resource];
          b.hands[other][c.resource] = 0;
        }
        hand[c.resource] += taken;
        b.event = name + ' played a monopoly and took ' + taken + (taken === 1 ? ' card.' : ' cards.');
      } else if (kind === 'roads') {
        b.freeRoads = 2;
        b.event = name + ' builds two free roads.';
      } else {
        const knights = (b.knights ??= {});
        knights[id] = (knights[id] ?? 0) + 1;
        b.resume = b.phase === 'roll' ? 'roll' : 'build';
        b.phase = 'robber';
        b.event = name + ' played a knight.';
        const best = b.strongestArmy ? (knights[b.strongestArmy] ?? 0) : 2;
        if (b.strongestArmy !== id && knights[id] > best) {
          b.strongestArmy = id;
          b.event += ' They have the strongest army!';
        }
      }
      held.splice(
        held.findIndex((h) => h.kind === kind && !h.fresh),
        1,
      );
      b.devPlayed = true;
    } else if (c.move === 'roll' && b.phase === 'roll') {
      b.dice = Array.from({ length: 2 }, () => Math.floor(Math.random() * 6) + 1);
      const sum = b.dice[0] + b.dice[1],
        land = tilesOf(b);
      b.rolledAt = Date.now();
      b.phase = 'build';
      if (sum === 7) {
        b.owed = {};
        for (const pid of b.order) {
          const total = Object.values(b.hands[pid]).reduce((a, v) => a + v, 0);
          if (total > 7) b.owed[pid] = Math.floor(total / 2);
        }
        b.phase = Object.keys(b.owed).length ? 'discard' : 'robber';
      }
      const due: Record<string, Hand> = {};
      for (const t of land)
        if (t.number === sum && t.resource !== 'sand' && t !== land[robberTile(b)])
          for (const v of t.vs) {
            const h = b.homes[v];
            if (h) (due[h.id] ??= emptyHand())[t.resource] += h.city ? 2 : 1;
          }
      const bank = bankLeft(b),
        short: Resource[] = [];
      for (const r of resources) {
        const owed = Object.keys(due).filter((pid) => due[pid][r]);
        const enough = owed.reduce((n, pid) => n + due[pid][r], 0) <= bank[r];
        if (!enough) short.push(r);
        // When the bank runs short, a lone player takes what is left and several get nothing.
        for (const pid of owed)
          if (enough) b.hands[pid][r] += due[pid][r];
          else if (owed.length === 1) b.hands[pid][r] += bank[r];
      }
      b.event =
        name + ' rolled ' + sum + (sum === 7 ? ' · the robber moves.' : '. Matching land produces supplies.');
      if (short.length)
        b.event += ' The bank is short of ' + short.map((r) => resourceNames[r]).join(' and ') + '.';
    } else if (c.move === 'robber' && b.phase === 'robber') {
      const index = c.index as number;
      if (!Number.isInteger(index) || !tilesOf(b)[index] || index === robberTile(b))
        return reject('Choose a different tile.');
      b.robber = index;
      b.victims = [
        ...new Set(
          tilesOf(b)
            [index].vs.map((v) => b.homes[v]?.id)
            .filter((pid) => pid && pid !== id && resources.some((k) => b.hands[pid][k] > 0)),
        ),
      ];
      b.phase = b.victims.length ? 'steal' : (b.resume ?? 'build');
      if (!b.victims.length) delete b.resume;
      b.event = name + ' moved the robber.';
    } else if (c.move === 'steal' && b.phase === 'steal') {
      const target = String(c.target);
      if (!b.victims?.includes(target)) return reject('Choose an adjacent opponent.');
      const other = b.hands[target];
      let draw = Math.floor(Math.random() * Object.values(other).reduce((a, v) => a + v, 0));
      for (const k of resources) {
        draw -= other[k];
        if (draw < 0) {
          other[k]--;
          hand[k]++;
          break;
        }
      }
      b.victims = [];
      b.phase = b.resume ?? 'build';
      delete b.resume;
      b.event = name + ' stole a resource.';
    } else if (c.move === 'harvest' && b.phase === 'harvest' && isResource(c.resource)) {
      hand[c.resource]++;
      b.phase = 'build';
      b.event = name + ' collected a harvest card.';
    } else if (
      b.phase === 'build' &&
      c.move === 'bank' &&
      isResource(c.give) &&
      isResource(c.want) &&
      c.give !== c.want
    ) {
      const rate = tradeRate(b, id, c.give);
      if (hand[c.give] < rate) return reject('You need more cards for that trade.');
      if (!bankLeft(b)[c.want]) return reject('The bank has no ' + resourceNames[c.want] + ' left.');
      hand[c.give] -= rate;
      hand[c.want]++;
      b.event = name + ' traded with the harbor.';
    } else if (b.phase === 'build' && c.move === 'offer') {
      const list = (many: unknown, one: unknown) => (Array.isArray(many) ? many : [one]);
      const gives = list(c.giveCards, c.give),
        wants = list(c.wantCards, c.want);
      if (!gives.length || !wants.length || ![...gives, ...wants].every(isResource))
        return reject('Choose cards to give and to get.');
      const give = toHand(gives as Resource[]),
        want = toHand(wants as Resource[]);
      if (resources.some((r) => give[r] && want[r])) return reject('Trade different resources.');
      if (handSize(want) > bankSize) return reject('That is too many cards.');
      if (!covers(hand, give)) return reject('You need more cards for that trade.');
      b.offer = { give, want };
      b.event = name + ' offered a trade.';
    } else if (c.move === 'cancel' && b.offer) {
      b.offer = null;
      b.event = name + ' withdrew the trade.';
    } else if (c.move === 'end' && b.phase === 'build') {
      b.turn = (b.turn + 1) % b.order.length;
      b.devPlayed = false;
      for (const held of b.dev?.[id] ?? []) held.fresh = false;
      b.phase = 'roll';
      b.event = name + ' ended their turn.';
    } else return reject('That action is unavailable in this phase.');
  }
  b.revision++;
}
