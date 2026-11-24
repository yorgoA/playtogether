import {
  robberTile,
  tradeRate,
  active,
  affordable,
  costs,
  emptyHand,
  locations,
  resources,
  orderRollers,
  shuffledLayout,
  tilesOf,
  type Island,
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
    event: 'Everyone rolls. The highest roll starts.',
  };
}
export function islandMove(b: Island, id: string, name: string, c: Record<string, unknown>) {
  const reject = (msg: string): never => {
    throw new GameError(msg, 409);
  };
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
    if (!hand[want] || !other[give]) return reject('The trade needs both cards.');
    other[give]--;
    hand[give]++;
    hand[want]--;
    other[want]++;
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
        !(setup ? piece === b.phase : b.phase === 'build') ||
        !locations(b, id, piece).includes(index)
      )
        return reject('Choose a highlighted location.');
      if (!setup) {
        if (!affordable(hand, piece)) return reject('You need more resources.');
        for (const [r, n] of Object.entries(costs[piece])) hand[r as Resource] -= n;
      }
      if (piece === 'road') b.roads[index] = id;
      else b.homes[index] = { id, city: piece === 'city' };
      b.event = name + ' built a ' + piece + '.';
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
      for (const t of land)
        if (t.number === sum && t.resource !== 'sand' && t !== land[robberTile(b)])
          for (const v of t.vs) {
            const h = b.homes[v];
            if (h) b.hands[h.id][t.resource] += h.city ? 2 : 1;
          }
      b.event =
        name + ' rolled ' + sum + (sum === 7 ? ' · the robber moves.' : '. Matching land produces supplies.');
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
      b.phase = b.victims.length ? 'steal' : 'build';
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
      b.phase = 'build';
      b.event = name + ' stole a resource.';
    } else if (c.move === 'harvest' && b.phase === 'harvest' && isResource(c.resource)) {
      hand[c.resource]++;
      b.phase = 'build';
      b.event = name + ' collected a harvest card.';
    } else if (
      b.phase === 'build' &&
      (c.move === 'bank' || c.move === 'offer') &&
      isResource(c.give) &&
      isResource(c.want) &&
      c.give !== c.want
    ) {
      const rate = c.move === 'bank' ? tradeRate(b, id, c.give) : 1;
      if (hand[c.give] < rate) return reject('You need more cards for that trade.');
      if (c.move === 'bank') {
        hand[c.give] -= rate;
        hand[c.want]++;
        b.event = name + ' traded with the harbor.';
      } else {
        b.offer = { give: c.give, want: c.want };
        b.event = name + ' offered a trade.';
      }
    } else if (c.move === 'cancel' && b.offer) {
      b.offer = null;
      b.event = name + ' withdrew the trade.';
    } else if (c.move === 'end' && b.phase === 'build') {
      b.turn = (b.turn + 1) % b.order.length;
      b.phase = 'roll';
      b.event = name + ' ended their turn.';
    } else return reject('That action is unavailable in this phase.');
  }
  b.revision++;
}
