import { covers, locations, resources, robberTile, tilesOf, type BoardView } from '../../lib/island/board';
import type { Phone } from './phone';

const over = (phone: Phone) => phone.room?.phase === 'results' || phone.expired;

// Saves every power and answers every quiz question, tapping again until the phone shows it as locked in.
export async function playQuiz(phone: Phone, choose: (round: number) => number, thinkMs: () => number) {
  let thought = 0;
  while (!over(phone)) {
    const stage = () => (phone.room?.phase === 'playing' ? phone.room.quiz?.stage : undefined);
    const round = phone.room!.round;
    if (stage() === 'power' && !phone.room!.quiz!.chosen.includes(phone.id))
      await phone.command({ action: 'quizPower', round, power: null });
    else if (stage() === 'question') {
      if (thought !== round) {
        thought = round;
        await phone.world.sleep(thinkMs());
      }
      if (stage() === 'question' && phone.room!.round === round && !phone.me?.answered)
        await phone.command({ action: 'input', round, value: choose(round) });
    }
    await phone.world.sleep(100);
  }
}

// Shoots `reactionMs` after the signal, or too early. Records what the player really did, by draw.
export async function playReaction(phone: Phone, reactionMs: () => number, early = false) {
  const real: number[] = [];
  let shot = 0;
  while (!over(phone)) {
    const { room } = phone;
    const draw = room?.duel?.draw ?? 0;
    const open = () =>
      !over(phone) &&
      phone.room!.phase === 'playing' &&
      phone.room!.duel?.draw === draw &&
      !phone.room!.revealing &&
      phone.room!.duel.alive.includes(phone.id) &&
      !phone.me?.answered;
    // Like useTap: the first tap is sent until the server has it.
    const fire = async (tap: Record<string, unknown>) => {
      while (open() && !(await phone.command({ action: 'input', round: room!.round, draw, ...tap })))
        await phone.world.sleep(300);
    };
    if (draw > shot && open()) {
      const signal = phone.room!.signalAt;
      const shown = signal === null ? undefined : phone.shown.get(signal);
      if (early) {
        shot = draw;
        await phone.world.sleep(300);
        await fire({ early: true });
      } else if (shown !== undefined) {
        shot = draw;
        await phone.world.sleep(shown + reactionMs() - phone.world.now());
        real[draw] = phone.world.now() - shown;
        await fire({ reactionMs: real[draw] });
      }
    }
    await phone.world.sleep(5);
  }
  return real;
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
  if (b.order[b.turn] !== id) return b.offer && covers(hand, b.offer.want) ? { move: 'accept' } : null;
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
  if (rich && rich !== poor && !b.bankEmpty?.includes(poor)) return { move: 'bank', give: rich, want: poor };
  return { move: 'end' };
}

// Claims cards, true or not, and accepts or calls what others claim.
export async function playPyramid(phone: Phone) {
  const { world } = phone;
  while (!over(phone)) {
    const b = phone.room?.pyramid;
    if (phone.room?.phase === 'playing' && b && b.index >= 0) {
      if (b.claim?.to === phone.id) {
        await world.sleep(400 + world.random() * 1200);
        await phone.command({ action: 'pyramidReply', index: b.index, call: world.random() < 0.5 });
      } else if (!b.claim && world.random() < 0.15) {
        const slots = b.slots!.flatMap((unused, slot) => (unused ? [slot] : []));
        const others = phone.room.players.filter((p) => p.id !== phone.id && p.connected);
        if (slots.length && others.length)
          await phone.command({
            action: 'pyramidClaim',
            index: b.index,
            slot: slots[Math.floor(world.random() * slots.length)],
            target: others[Math.floor(world.random() * others.length)].id,
          });
      }
    }
    await world.sleep(400);
  }
}
// The host turns the next card once the table is quiet.
export async function hostPyramid(host: Phone, quietMs = 2500) {
  while (!over(host)) {
    const b = host.room?.pyramid;
    await host.world.sleep(quietMs);
    const now = host.room?.pyramid;
    if (host.room?.phase === 'playing' && b && now && now.index === b.index && !now.claim)
      await host.command({ action: 'pyramidFlip', index: now.index });
  }
}

// Plays Kings Cup by the rules, with everyone joining in where a card asks them to.
export async function playKings(phone: Phone, tapMs = () => 200 + phone.world.random() * 400) {
  const { world } = phone;
  let answered = -1;
  while (!over(phone)) {
    const b = phone.room?.kings;
    if (phone.room?.phase === 'playing' && b) {
      const send = (move: string, more = {}) => phone.command({ action: 'kings', move, seq: b.seq, ...more });
      const others = b.order.filter((id) => id !== phone.id);
      const other = others[Math.floor(world.random() * others.length)];
      if (b.phase === 'race' && b.racers.includes(phone.id) && !b.tapped.includes(phone.id)) {
        const shown = world.now();
        await world.sleep(tapMs());
        const ms = world.now() - shown;
        // Like useRaceTap: the tap is sent until the server has it.
        const racing = () =>
          phone.room?.kings?.phase === 'race' && phone.room.kings.seq === b.seq && !over(phone);
        while (racing() && !phone.room!.kings!.tapped.includes(phone.id) && !(await send('tap', { ms })))
          await world.sleep(300);
      } else if (b.phase === 'honor' && answered !== b.seq) {
        answered = b.seq;
        if (world.random() < 0.4) await send('drank');
      } else if (b.turn === phone.id) {
        if (b.phase === 'draw') {
          const left = b.left.flatMap((there, slot) => (there ? [slot] : []));
          await send('draw', { slot: left[Math.floor(world.random() * left.length)] });
        } else if (b.phase === 'pick') await send('pick', { target: other });
        else if (b.phase === 'rule') await send('rule', { text: 'No phones' });
        else if (b.phase === 'open' || b.phase === 'honor') {
          await world.sleep(1500);
          await send('done');
        }
      }
    }
    await world.sleep(150);
  }
}
