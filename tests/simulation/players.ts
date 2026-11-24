import { locations, resources, robberTile, tilesOf, type BoardView } from '../../lib/island/board';
import type { Phone } from './phone';

const over = (phone: Phone) => phone.room?.phase === 'results' || phone.expired;

// Answers every quiz round, tapping again until the phone shows the answer as locked in.
export async function playQuiz(phone: Phone, choose: (round: number) => number, thinkMs: () => number) {
  let round = 0;
  while (!over(phone)) {
    const room = phone.room!;
    if (room.phase === 'playing' && !room.revealing && room.round > round) {
      round = room.round;
      await phone.world.sleep(thinkMs());
    }
    const now = phone.room!;
    if (now.phase === 'playing' && !now.revealing && now.round === round && round && !phone.me?.answered)
      await phone.command({ action: 'input', round, value: choose(round) });
    await phone.world.sleep(100);
  }
}

// Reacts to GO after `reactionMs`, or taps early. Records what the player really did.
export async function playReaction(phone: Phone, reactionMs: () => number, early = false) {
  const real: number[] = [];
  let round = 0;
  while (!over(phone)) {
    const room = phone.room!;
    if (room.phase === 'playing' && !room.revealing && room.round > round) {
      round = room.round;
      if (early) {
        await phone.world.sleep(300);
        while (!over(phone) && phone.room!.round === round && !phone.me?.answered && !phone.room!.revealing)
          if (!(await phone.command({ action: 'input', round, early: true }))) await phone.world.sleep(200);
        continue;
      }
      while (!over(phone) && phone.room!.round === round && !phone.room!.revealing) {
        const signal = phone.room!.signalAt;
        const shown = signal === null ? undefined : phone.shown.get(signal);
        if (shown !== undefined && !phone.me?.answered) {
          const taken = reactionMs();
          await phone.world.sleep(shown + taken - phone.world.now());
          const tapped = phone.world.now() - shown;
          if (await phone.command({ action: 'input', round, reactionMs: tapped })) real[round] = tapped;
          break;
        }
        await phone.world.sleep(5);
      }
    }
    await phone.world.sleep(20);
  }
  return real;
}

// Holds the pedal and presses Boost whenever it is ready, resending like RaceController.
export async function playRace(phone: Phone) {
  while (!over(phone)) {
    const car = phone.room?.racers.find((r) => r.id === phone.id);
    if (phone.room?.phase === 'playing' && car && car.finishedAt === null) {
      const powerUp = car.boostReadyAt <= phone.room.serverTime;
      await phone.command({ action: 'drive', steering: 0, accelerate: 1, brake: 0, drift: false, powerUp });
      await phone.world.sleep(500);
    } else await phone.world.sleep(100);
  }
}

// Plays Island Settlers with simple legal moves, from only what the phone can see.
export async function playIsland(phone: Phone) {
  while (!over(phone)) {
    const b = phone.room?.island as BoardView | undefined;
    const move =
      phone.room?.phase === 'playing' && b?.hand ? choose(b, phone.id, () => phone.world.random()) : null;
    if (move) await phone.command({ action: 'island', revision: b!.revision, ...move });
    await phone.world.sleep(move ? 200 : 300);
  }
}
function choose(b: BoardView, id: string, random: () => number): Record<string, unknown> | null {
  const hand = b.hand!;
  const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)];
  if (b.phase === 'discard') {
    const owed = b.owed?.[id];
    if (!owed) return null;
    return { move: 'discard', cards: resources.flatMap((r) => Array(hand[r]).fill(r)).slice(0, owed) };
  }
  if (b.order[b.turn] !== id) return b.offer && hand[b.offer.want] ? { move: 'accept' } : null;
  const value = (v: number) =>
    tilesOf(b).reduce((n, t) => n + (t.number && t.vs.includes(v) ? 6 - Math.abs(7 - t.number) : 0), 0);
  if (b.phase === 'settlement')
    return {
      move: 'place',
      piece: 'settlement',
      index: locations(b, id, 'settlement').sort((x, y) => value(y) - value(x))[0],
    };
  if (b.phase === 'road') return { move: 'place', piece: 'road', index: pick(locations(b, id, 'road')) };
  if (b.phase === 'roll' || b.phase === 'order') return { move: 'roll' };
  if (b.phase === 'robber')
    return { move: 'robber', index: pick(tilesOf(b).flatMap((_, i) => (i === robberTile(b) ? [] : [i]))) };
  if (b.phase === 'steal') return { move: 'steal', target: pick(b.victims!) };
  if (b.offer) return { move: 'cancel' };
  const can = (cost: Record<string, number>) =>
    Object.entries(cost).every(([r, n]) => hand[r as keyof typeof hand] >= n);
  const spots = (piece: 'city' | 'settlement' | 'road') => locations(b, id, piece);
  if (can({ grain: 2, ore: 3 }) && spots('city').length)
    return { move: 'place', piece: 'city', index: pick(spots('city')) };
  if (can({ timber: 1, clay: 1, grain: 1, wool: 1 }) && spots('settlement').length)
    return { move: 'place', piece: 'settlement', index: pick(spots('settlement')) };
  const mine = Object.values(b.roads).filter((o) => o === id).length;
  if (mine < 8 && can({ timber: 1, clay: 1 }) && spots('road').length)
    return { move: 'place', piece: 'road', index: pick(spots('road')) };
  const rich = resources.find((r) => hand[r] >= 5);
  const poor = [...resources].sort((x, y) => hand[x] - hand[y])[0];
  if (rich && rich !== poor) return { move: 'bank', give: rich, want: poor };
  return { move: 'end' };
}
