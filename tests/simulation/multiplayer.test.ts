import { afterEach, describe, expect, it, vi } from 'vitest';
import { links, Lost, openTable, Phone, type Link, type Table } from './phone';
import { hostPyramid, playIsland, playKings, playPyramid, playQuiz, playRace, playReaction } from './players';
import type { RoomSnapshot } from '../../lib/contract';
import { virtualWorld } from './world';

// Minutes of play take seconds, but a busy CI machine needs room.
vi.setConfig({ testTimeout: 60_000 });
afterEach(() => vi.restoreAllMocks());

const mix = (count: number): Link[] =>
  Array.from({ length: count }, (_, i) => [links.wifi, links.busy, links.slow][i % 3]);
const stored = (sqlite: ReturnType<typeof virtualWorld>['sqlite']) =>
  JSON.parse((sqlite.prepare('SELECT state FROM rooms').get() as { state: string }).state);
const busyRefusals = (t: Table) => t.stats.statuses[409] ?? 0;
const failures = (t: Table) => Object.entries(t.stats.statuses).filter(([s]) => Number(s) >= 500);
// Phones keep polling after the match, so they should all end up with the same result.
async function settle(t: Table) {
  await Promise.all(
    [t.host, ...t.phones].map((p) => p.until(() => p.room?.phase === 'results', 60_000, 'results')),
  );
  await t.world.sleep(6000);
  const scores = (p: Table['host']) => p.room!.players.map((x) => [x.name, x.score]);
  for (const phone of t.phones) expect(scores(phone)).toEqual(scores(t.host));
}

describe.each([1, 2, 3])('full rooms on mixed connections (seed %i)', (seed) => {
  it('12 quiz players', async () => {
    const w = virtualWorld(seed);
    await w.run(async () => {
      const t = await openTable(w, 'quiz', mix(12), 4);
      await t.start();
      const correct = (round: number) => stored(w.sqlite).deck[round - 1].correct as number;
      await Promise.all(
        t.phones.map((p, i) =>
          playQuiz(
            p,
            (round) => (correct(round) + (i % 2)) % 4,
            () => 500 + w.random() * 4000,
          ),
        ),
      );
      await settle(t);
      // Even players always answer correctly, odd ones never do. A resent answer must not count twice.
      t.phones.forEach((p, i) => {
        if (i % 2) expect(p.me!.score).toBe(0);
        else {
          expect(p.me!.score).toBeGreaterThanOrEqual(4 * 500);
          expect(p.me!.score).toBeLessThanOrEqual(4 * 1000);
        }
      });
      expect(failures(t)).toEqual([]);
      await t.close();
    });
  });

  it('8 reaction players, timed fairly whatever their connection and clock', async () => {
    const w = virtualWorld(seed);
    await w.run(async () => {
      const t = await openTable(w, 'reaction', mix(8), 4);
      await t.start();
      const recorded = t.phones.map(() => [] as number[]);
      const watch = t.phones.map(async (p, i) => {
        while (p.room?.phase !== 'results') {
          const me = p.room?.players.find((x) => x.id === p.id);
          if (me?.reactionMs != null) recorded[i][p.room!.round] = me.reactionMs;
          await w.sleep(50);
        }
      });
      const real = await Promise.all(
        t.phones.map((p, i) => playReaction(p, () => 180 + w.random() * 120, i === 7)),
      );
      await Promise.all(watch);
      await settle(t);
      t.phones.slice(0, 7).forEach((p, i) => {
        for (let round = 1; round <= 4; round++) {
          expect(real[i][round], 'P' + i + ' tapped in round ' + round).toBeGreaterThan(0);
          expect(Math.abs(recorded[i][round] - real[i][round])).toBeLessThanOrEqual(1);
        }
      });
      expect(t.phones[7].me!.score).toBe(0);
      expect(failures(t)).toEqual([]);
      await t.close();
    });
  });

  it('4 racers, where a slow connection costs little', async () => {
    const w = virtualWorld(seed);
    await w.run(async () => {
      const t = await openTable(w, 'turbo', [links.wifi, links.wifi, links.busy, links.slow]);
      await t.start();
      await Promise.all(t.phones.map(playRace));
      await settle(t);
      const race = stored(w.sqlite);
      for (const car of race.race.cars) expect(car.progress).toBe(3);
      expect(failures(t)).toEqual([]);
      expect(busyRefusals(t)).toBe(0);
      await t.close();
    });
  });

  it('a full island of two people and two bots', async () => {
    const w = virtualWorld(seed);
    await w.run(async () => {
      const t = await openTable(w, 'settlers', [links.wifi, links.slow]);
      for (let i = 0; i < 2; i++) await t.host.keepTrying(() => t.host.request({ action: 'addBot' }));
      await t.start();
      await Promise.all(t.phones.map(playIsland));
      await settle(t);
      const { island, players } = stored(w.sqlite);
      expect(Math.max(...players.map((p: { score: number }) => p.score))).toBeGreaterThanOrEqual(10);
      for (const hand of Object.values(island.hands))
        for (const n of Object.values(hand as object)) expect(n).toBeGreaterThanOrEqual(0);
      expect(t.host.room!.island!.hand).toBeUndefined();
      expect(failures(t)).toEqual([]);
      await t.close();
    });
  });
});

describe('dropped phones', () => {
  it('a quiz goes on when half the room drops, and they come back to their seats', async () => {
    const w = virtualWorld(11);
    await w.run(async () => {
      const t = await openTable(w, 'quiz', mix(12), 6);
      await t.start();
      const play = t.phones.map((p) =>
        playQuiz(
          p,
          () => 1,
          () => 800,
        ),
      );
      await w.sleep(3000);
      const dropped = t.phones.slice(6);
      for (const p of dropped) p.offline = true;
      await w.sleep(30_000);
      expect(t.host.room!.players.filter((p) => !p.connected)).toHaveLength(6);
      expect(t.host.room!.phase).toBe('playing');
      for (const p of dropped) p.offline = false;
      await Promise.all(play);
      await settle(t);
      expect(t.phones.filter((p) => p.expired)).toEqual([]);
      expect(t.host.room!.players.every((p) => p.connected)).toBe(true);
      await t.close();
    });
  });
  it('the host screen can drop and return without losing the match', async () => {
    const w = virtualWorld(12);
    await w.run(async () => {
      const t = await openTable(w, 'quiz', mix(4), 3);
      await t.start();
      const play = t.phones.map((p) =>
        playQuiz(
          p,
          () => 1,
          () => 800,
        ),
      );
      t.host.offline = true;
      await w.sleep(10_000);
      t.host.offline = false;
      await Promise.all(play);
      await settle(t);
      await t.close();
    });
  });
  it('a bot plays an island seat until its player returns', async () => {
    const w = virtualWorld(13);
    await w.run(async () => {
      const t = await openTable(w, 'settlers', [links.wifi, links.busy]);
      await t.start();
      const play = t.phones.map(playIsland);
      await w.sleep(4000);
      const gone = t.phones[1];
      gone.offline = true;
      await t.host.until(() => t.host.room!.players.some((p) => !p.connected), 60_000, 'the drop');
      await t.host.keepTrying(() => t.host.request({ action: 'standIn', playerId: gone.id }));
      const before = t.host.room!.island!.revision;
      await w.sleep(15_000);
      expect(t.host.room!.island!.revision).toBeGreaterThan(before);
      const seat = () => t.host.room!.players.find((p) => p.id === gone.id)!;
      expect(seat().standIn).toBe(true);
      gone.offline = false;
      await t.host.until(() => !seat().standIn && seat().connected, 10_000, 'the seat back');
      await Promise.all(play);
      await settle(t);
      await t.close();
    });
  });
  it('a race finishes for the others when one car is abandoned', async () => {
    const w = virtualWorld(14);
    await w.run(async () => {
      const t = await openTable(w, 'turbo', [links.wifi, links.busy, links.wifi]);
      await t.start();
      const play = t.phones.map(playRace);
      await w.sleep(5000);
      const gone = t.phones[2];
      gone.offline = true;
      await t.host.until(() => t.host.room!.players.some((p) => !p.connected), 60_000, 'the drop');
      await t.host.keepTrying(() => t.host.request({ action: 'kick', playerId: gone.id }));
      await Promise.all(play.slice(0, 2));
      expect(t.host.room!.racers).toHaveLength(2);
      gone.offline = false;
      await play[2];
      expect(gone.expired).toBe(true);
      await t.close();
    });
  });
});

describe('worst moments', () => {
  it.each([5, 20, 40])('12 answers at the same instant all count (database %i ms)', async (databaseMs) => {
    const w = virtualWorld(21, databaseMs);
    await w.run(async () => {
      const t = await openTable(w, 'quiz', Array(12).fill({ oneWay: 10, jitter: 0, loss: 0 }), 1);
      await t.start();
      const sent = await Promise.all(t.phones.map((p) => p.command({ action: 'input', round: 1, value: 0 })));
      expect(sent.filter(Boolean)).toHaveLength(12);
      expect(stored(w.sqlite).players.every((p: { answered: boolean }) => p.answered)).toBe(true);
      await t.close();
    });
  });
  it('12 phones scanning the code at once all get a seat', async () => {
    const w = virtualWorld(22, 20);
    await w.run(async () => {
      const t = await openTable(w, 'quiz', Array(12).fill({ oneWay: 10, jitter: 0, loss: 0 }), 1);
      expect(busyRefusals(t)).toBe(0);
      expect(stored(w.sqlite).players).toHaveLength(12);
      await t.close();
    });
  });
});

// GO should appear on every phone together with the TV.
async function goDelays(link: Link, seed: number) {
  const w = virtualWorld(seed);
  const delays: number[] = [];
  await w.run(async () => {
    const t = await openTable(w, 'reaction', Array(8).fill({ ...link, loss: 0 }), 4);
    await t.start();
    await Promise.all(t.phones.map((p) => playReaction(p, () => 200)));
    for (const p of t.phones) for (const [signal, at] of p.shown) delays.push(Math.abs(at - signal));
    await t.close();
  });
  expect(delays.length).toBe(32);
  return Math.max(...delays);
}
async function raceTimes(link: Link, seed: number) {
  const w = virtualWorld(seed);
  return w.run(async () => {
    const t = await openTable(w, 'turbo', Array(4).fill(link));
    await t.start();
    await Promise.all(t.phones.map(playRace));
    await t.close();
    const room = stored(w.sqlite);
    return room.race.cars.map((c: { finishedAt: number }) => c.finishedAt - room.started) as number[];
  });
}
describe.each([1, 2, 3])('timing (seed %i)', (seed) => {
  it('shows GO within 60 ms of the TV on Wi-Fi, busy or not', async () => {
    expect(await goDelays(links.wifi, seed)).toBeLessThan(60);
    vi.restoreAllMocks();
    expect(await goDelays(links.busy, seed)).toBeLessThan(60);
  });
  it('a very slow connection costs a racer less than four seconds in a 45 second race', async () => {
    const wifi = await raceTimes(links.wifi, seed);
    vi.restoreAllMocks();
    const slow = await raceTimes(links.slow, seed);
    // The same car each time, so the starting lane does not matter.
    wifi.forEach((time, car) => expect(slow[car] - time).toBeLessThan(4000));
  });
});

describe('slow connections and lost messages', () => {
  it('GO appears with the TV on a very slow connection', async () => {
    expect(await goDelays(links.slow, 1)).toBeLessThan(120);
  });
  // Delivers the first request to the server if `arrives`, but never the reply.
  function losingFirst(
    w: ReturnType<typeof virtualWorld>,
    matches: (init: RequestInit) => boolean,
    arrives: boolean,
  ) {
    let lost = false;
    return {
      ...w,
      server: async (path: string, init: RequestInit) => {
        if (lost || !matches(init)) return w.server(path, init);
        lost = true;
        if (arrives) await w.server(path, init);
        throw new Lost('Connection failed.');
      },
    };
  }
  it.each([
    ['in a room with space', 12],
    ['for the last seat', 1],
  ])('a player whose join reply was lost can tap Join again, %s', async (_label, spaces) => {
    const w = virtualWorld(23);
    await w.run(async () => {
      const t = await openTable(w, 'turbo', Array(spaces === 1 ? 3 : 1).fill(links.wifi));
      const world = losingFirst(w, (init) => String(init.body).includes('"join"'), true);
      const ana = new Phone(world, t.code, links.wifi, t.stats);
      await ana.join('Ana').catch((error) => expect(error).toBeInstanceOf(Lost));
      expect(stored(w.sqlite).players.map((p: { name: string }) => p.name)).toContain('Ana');
      await w.sleep(1000);
      try {
        await ana.join('Ana');
      } finally {
        await t.close();
      }
    });
  });
  it('a reaction tap that is lost is sent again with its first time', async () => {
    for (const arrives of [false, true]) {
      const w = virtualWorld(24);
      await w.run(async () => {
        const t = await openTable(w, 'reaction', [links.wifi, links.wifi], 1);
        await t.start();
        const world = losingFirst(w, (init) => String(init.body).includes('reactionMs'), arrives);
        (t.phones[0] as { world: unknown }).world = world;
        const [real] = await Promise.all(t.phones.map((p) => playReaction(p, () => 200)));
        await settle(t);
        expect(t.phones[0].me!.reactionMs).toBe(real[1]);
        await t.close();
      });
      vi.restoreAllMocks();
    }
  });
});

// Every card a device is shown must be one it is allowed to see.
const cardsIn = (value: unknown) =>
  JSON.stringify(value ?? null)
    .match(/"[A2-9TJQK][SHDC]"/g)
    ?.map((c) => c.slice(1, 3)) ?? [];
function watchCards(seen: { hands: Map<string, string[]> }) {
  return (room: RoomSnapshot, phone: Phone) => {
    const p = room.pyramid;
    if (p) {
      const { hand, outcome, ...table } = p;
      if (hand) {
        expect(p.index, 'hands are shown before the first card only').toBe(-1);
        expect(phone.token, 'the TV never sees a hand').not.toBe('');
        seen.hands.set(phone.id, hand);
      }
      expect(cardsIn(table)).toHaveLength(Math.min(15, p.index + 1));
      expect(cardsIn(outcome).length).toBe(outcome && outcome.verdict !== 'accepted' ? 1 : 0);
    }
    if (room.kings) expect(cardsIn(room)).toEqual(room.kings.card ? [room.kings.card] : []);
  };
}

describe.each([1, 2, 3])('drinking games on mixed connections (seed %i)', (seed) => {
  it('8 Pyramid players', async () => {
    const w = virtualWorld(seed);
    await w.run(async () => {
      const seen = { hands: new Map<string, string[]>() };
      const t = await openTable(w, 'pyramid', mix(8), 1, watchCards(seen));
      await t.start();
      await Promise.all([hostPyramid(t.host), ...t.phones.map(playPyramid)]);
      await settle(t);
      const { pyramid, players } = stored(w.sqlite);
      expect(pyramid.index).toBe(15);
      const hands = [...seen.hands.values()];
      expect(hands).toHaveLength(8);
      expect(new Set([...hands.flat(), ...pyramid.cards]).size).toBe(15 + 8 * 4);
      // Cards were played, and only played cards cost anybody points.
      const used = Object.values(pyramid.hands as Record<string, (string | null)[]>)
        .flat()
        .filter((c) => c === null).length;
      expect(used).toBeGreaterThan(5);
      const penalties = players.map((p: { score: number }) => -p.score);
      const total = penalties.reduce((a: number, b: number) => a + b, 0);
      expect(Math.min(...penalties)).toBeGreaterThanOrEqual(0);
      expect(total).toBeGreaterThanOrEqual(used);
      expect(total).toBeLessThanOrEqual(used * 10);
      expect(failures(t)).toEqual([]);
      await t.close();
    });
  });
  it('8 Kings Cup players', async () => {
    const w = virtualWorld(seed);
    await w.run(async () => {
      const t = await openTable(w, 'kings', mix(8), 1, watchCards({ hands: new Map() }));
      await t.start();
      await Promise.all(t.phones.map((p) => playKings(p)));
      await settle(t);
      const { kings, players } = stored(w.sqlite);
      expect(kings.kings).toBe(4);
      const drawn = kings.deck.filter((_: string, slot: number) => !kings.left[slot]);
      expect(drawn.filter((c: string) => c[0] === 'K')).toHaveLength(4);
      for (const p of players) expect(p.score).toBeLessThanOrEqual(0);
      expect(kings.rules).toHaveLength(3);
      expect(failures(t)).toEqual([]);
      await t.close();
    });
  });
});

describe('drinking games with dropped phones', () => {
  it('Pyramid goes on once a player who was claimed against is removed', async () => {
    const w = virtualWorld(31);
    await w.run(async () => {
      const t = await openTable(w, 'pyramid', [links.wifi, links.busy, links.wifi], 1);
      await t.start();
      const flip = () =>
        t.host.keepTrying(() =>
          t.host.request({ action: 'pyramidFlip', index: t.host.room!.pyramid!.index }),
        );
      await flip();
      const [a, gone, c] = t.phones;
      await a.until(() => a.room!.pyramid!.index === 0, 5000, 'the first card');
      expect(await a.command({ action: 'pyramidClaim', index: 0, slot: 0, target: gone.id })).toBe(true);
      gone.offline = true;
      await t.host.until(() => t.host.room!.players.some((p) => !p.connected), 60_000, 'the drop');
      expect(t.host.room!.pyramid!.claim).not.toBeNull();
      await t.host.keepTrying(() => t.host.request({ action: 'kick', playerId: gone.id }));
      expect(t.host.room!.pyramid!.claim).toBeNull();
      await Promise.all([hostPyramid(t.host), playPyramid(a), playPyramid(c)]);
      expect(t.host.room!.phase).toBe('results');
      await t.close();
    });
  });
  it('a repeated or badly timed press on the TV never skips a Pyramid card', async () => {
    const w = virtualWorld(34);
    await w.run(async () => {
      const t = await openTable(w, 'pyramid', [links.wifi, links.wifi], 1);
      await t.start();
      const flip = (index: number) => t.host.command({ action: 'pyramidFlip', index });
      expect(await flip(-1)).toBe(true);
      expect(await flip(-1)).toBe(false);
      const [a, b] = t.phones;
      await a.until(() => a.room!.pyramid!.index === 0, 5000, 'the first card');
      // A claim and the next card, pressed at the same moment: whichever the server takes first wins.
      const [claimed, flipped] = await Promise.all([
        a.command({ action: 'pyramidClaim', index: 0, slot: 0, target: b.id }),
        flip(0),
      ]);
      expect([claimed, flipped].filter(Boolean)).toHaveLength(1);
      await w.sleep(1500);
      expect(t.host.room!.pyramid!.index).toBe(flipped ? 1 : 0);
      expect(t.host.room!.pyramid!.claim === null).toBe(flipped);
      await t.close();
    });
  });
  it('removing a Kings Cup player in the middle of their card gives the next player a fresh turn', async () => {
    const w = virtualWorld(36);
    await w.run(async () => {
      const t = await openTable(w, 'kings', [links.wifi, links.wifi, links.wifi], 1);
      await t.start();
      const [gone, next] = t.phones.map((_, i) => t.host.room!.kings!.order[i]);
      const state = stored(w.sqlite);
      Object.assign(state.kings, { seq: 7, phase: 'pick', card: '8S', slot: 0 });
      w.sqlite.prepare('UPDATE rooms SET state=?, version=version+1').run(JSON.stringify(state));
      t.phones.find((p) => p.id === gone)!.offline = true;
      await t.host.until(() => t.host.room!.players.some((p) => !p.connected), 60_000, 'the drop');
      await t.host.keepTrying(() => t.host.request({ action: 'kick', playerId: gone }));
      expect(t.host.room!.kings).toMatchObject({ phase: 'draw', card: null, turn: next });
      await t.close();
    });
  });
  it('a Kings Cup tap that arrives after the race does not count in the next one', async () => {
    const w = virtualWorld(35);
    await w.run(async () => {
      const t = await openTable(w, 'kings', [links.wifi, links.wifi, links.wifi], 1);
      await t.start();
      const state = stored(w.sqlite);
      Object.assign(state.kings, { seq: 7, phase: 'race', card: '4S', racers: t.phones.map((p) => p.id) });
      w.sqlite.prepare('UPDATE rooms SET state=?, version=version+1').run(JSON.stringify(state));
      expect(await t.phones[0].command({ action: 'kings', move: 'tap', seq: 5 })).toBe(false);
      expect(await t.phones[0].command({ action: 'kings', move: 'tap', seq: 7 })).toBe(true);
      expect(stored(w.sqlite).kings.tapped).toEqual([t.phones[0].id]);
      await t.close();
    });
  });
  it('a Pyramid player who drops and returns keeps their cards', async () => {
    const w = virtualWorld(32);
    await w.run(async () => {
      const t = await openTable(w, 'pyramid', [links.wifi, links.wifi, links.wifi], 1);
      await t.start();
      const gone = t.phones[2];
      gone.offline = true;
      await t.host.until(() => t.host.room!.players.some((p) => !p.connected), 60_000, 'the drop');
      expect(await t.phones[0].command({ action: 'pyramidClaim', index: -1, slot: 0, target: gone.id })).toBe(
        false,
      );
      gone.offline = false;
      await t.host.until(() => t.host.room!.players.every((p) => p.connected), 10_000, 'the return');
      expect(gone.room!.pyramid!.slots).toEqual([true, true, true, true]);
      await Promise.all([hostPyramid(t.host), ...t.phones.map(playPyramid)]);
      await settle(t);
      await t.close();
    });
  });
  it.each([
    ['the host skips them', 'kingsNext'],
    ['the host removes them', 'kick'],
  ])('Kings Cup goes on without its current player when %s', async (_label, action) => {
    const w = virtualWorld(33);
    await w.run(async () => {
      const t = await openTable(w, 'kings', [links.wifi, links.busy, links.wifi, links.wifi], 1);
      await t.start();
      const gone = t.phones.find((p) => p.id === t.host.room!.kings!.turn)!;
      gone.offline = true;
      const playing = t.phones.filter((p) => p !== gone).map((p) => playKings(p));
      await t.host.until(() => t.host.room!.players.some((p) => !p.connected), 60_000, 'the drop');
      let running = true;
      const skipping = (async () => {
        while (running && t.host.room!.phase === 'playing') {
          const b = t.host.room!.kings!;
          if (b.turn === gone.id || b.phase === 'race')
            await t.host.command(action === 'kick' ? { action, playerId: gone.id } : { action, seq: b.seq });
          await w.sleep(4000);
        }
      })();
      await Promise.all(playing);
      running = false;
      await skipping;
      expect(stored(w.sqlite).kings.kings).toBe(4);
      await t.close();
    });
  });
});

describe('Kings Cup on bad connections', () => {
  it('a Kings Cup catch whose reply was lost costs one sip when pressed again', async () => {
    const w = virtualWorld(41);
    await w.run(async () => {
      const t = await openTable(w, 'kings', [links.wifi, links.wifi, links.wifi], 1);
      await t.start();
      const state = stored(w.sqlite);
      state.kings.master = t.phones[0].id;
      w.sqlite.prepare('UPDATE rooms SET state=?, version=version+1').run(JSON.stringify(state));
      await w.sleep(2000);
      const [master, caught] = t.phones;
      let lost = false;
      const server: typeof w.server = async (path, init) => {
        const reply = await w.server(path, init);
        if (lost || !String(init.body).includes('catch')) return reply;
        lost = true;
        throw new Lost('Connection failed.');
      };
      (master as { world: unknown }).world = { ...w, server };
      const body = {
        action: 'kings',
        move: 'catch',
        seq: master.room!.kings!.seq,
        target: caught.id,
        press: 'one-press-1',
      };
      await master.command(body);
      await w.sleep(700);
      await master.command(body);
      await w.sleep(1500);
      const { score } = t.host.room!.players.find((p) => p.id === caught.id)!;
      await t.close();
      expect(score).toBe(-1);
    });
  });
  it('the Kings Cup tap race is not decided by the connection', async () => {
    let races = 0;
    let slowLost = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const w = virtualWorld(seed);
      await w.run(async () => {
        const t = await openTable(w, 'kings', [links.wifi, links.wifi, links.busy, links.slow], 1);
        await t.start();
        const counted = new Set<number>();
        t.host.watch = ({ kings: b }) => {
          if (!b || b.racers.length !== 4 || b.phase !== 'open' || !b.event || counted.has(b.seq)) return;
          counted.add(b.seq);
          races++;
          if (b.event.drinkers[0] === t.phones[3].id) slowLost++;
        };
        // Everyone taps equally fast after their own phone shows the race.
        await Promise.all(t.phones.map((p) => playKings(p, () => 300 + w.random() * 300)));
        await t.close();
      });
      vi.restoreAllMocks();
    }
    // One in four would be fair.
    expect(slowLost / races).toBeLessThan(0.5);
  });
});
