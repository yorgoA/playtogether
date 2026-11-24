import type { RoomSnapshot } from '../../lib/contract';
import { adultGames, RoomResponse } from '../../lib/contract';
import type { World } from './world';

export type Link = { oneWay: number; jitter: number; loss: number };
export const links = {
  wifi: { oneWay: 8, jitter: 8, loss: 0 },
  busy: { oneWay: 60, jitter: 80, loss: 0.02 },
  slow: { oneWay: 220, jitter: 200, loss: 0.05 },
} satisfies Record<string, Link>;

export class Refused extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export class Lost extends Error {}

export type Stats = { requests: number; lost: number; statuses: Record<string, number> };
export const newStats = (): Stats => ({ requests: 0, lost: 0, statuses: {} });

// A phone (or the host screen) that behaves like `useRoom` and `useSignal` in lib/controller/room.ts.
// Keep the two in step when the polling or clock rules there change.
export class Phone {
  room: RoomSnapshot | null = null;
  id = '';
  // Made up once, and sent with every try to join.
  joinId = '';
  token = '';
  offline = false;
  expired = false;
  // When this phone showed GO, by signal time.
  shown = new Map<number, number>();
  // How long before the signal the phone learned of it.
  leads = new Map<number, number>();
  // Called with everything this device is ever shown.
  watch: (room: RoomSnapshot, phone: Phone) => void = () => {};
  private stopped = false;
  private busy = false;
  private rtt = Infinity;
  private delta: number;

  // `skew` is how wrong this device's own clock is.
  constructor(
    readonly world: World,
    readonly code: string,
    readonly link: Link,
    readonly stats: Stats,
    readonly skew = 0,
  ) {
    this.delta = 0;
    while (this.joinId.length < 16) this.joinId += Math.floor(world.random() * 36).toString(36);
  }
  deviceNow() {
    return this.world.now() + this.skew;
  }
  // The server's time, as this phone believes it.
  clock() {
    return this.deviceNow() + this.delta;
  }
  private async travel() {
    await this.world.sleep(this.link.oneWay + this.world.random() * this.link.jitter);
    if (this.offline || this.world.random() < this.link.loss) {
      this.stats.lost++;
      throw new Lost('Connection failed.');
    }
  }
  async request(body?: Record<string, unknown>) {
    const sentAt = this.deviceNow();
    this.stats.requests++;
    await this.travel(); // A loss here never reaches the server.
    const response = await this.world.server('/api/rooms/' + this.code, {
      method: body ? 'POST' : 'GET',
      headers: {
        'content-type': 'application/json',
        ...(this.token ? { authorization: 'Bearer ' + this.token } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    this.stats.statuses[response.status] = (this.stats.statuses[response.status] ?? 0) + 1;
    await this.travel(); // A loss here reached the server, but the phone never hears back.
    if (!response.ok) throw new Refused((data as { error: string }).error, response.status);
    const reply = RoomResponse.parse(data);
    this.accept(reply.room, sentAt);
    return reply;
  }
  private accept(room: RoomSnapshot, sentAt: number) {
    this.watch(room, this);
    const arrived = this.deviceNow();
    const trip = arrived - sentAt;
    this.rtt += 1;
    if (trip <= this.rtt) {
      this.rtt = trip;
      this.delta = room.serverTime - (sentAt + arrived) / 2;
    }
    if (!this.room || this.room.serverTime <= room.serverTime) this.room = room;
    const signal = this.room.signalAt;
    if (signal !== null && this.room.phase === 'playing' && !this.leads.has(signal)) {
      const lead = signal - this.clock();
      this.leads.set(signal, lead);
      void this.world.sleep(lead).then(() => this.shown.set(signal, this.world.now()));
    }
  }
  async join(name: string) {
    const reply = await this.request({ action: 'join', name, joinId: this.joinId });
    this.id = reply.playerId!;
    this.token = reply.playerToken!;
    return this;
  }
  // Joins and gets ready, tapping again after a lost message like a person would.
  async enter(name: string) {
    await this.keepTrying(() => this.join(name));
    await this.keepTrying(() => this.request({ action: 'ready', ready: true }));
    return this;
  }
  async keepTrying(action: () => Promise<unknown>, tries = 20) {
    for (let i = 0; i < tries; i++) {
      try {
        return await action();
      } catch (error) {
        if (error instanceof Refused && error.status !== 409 && error.status < 500) throw error;
        await this.world.sleep(700);
      }
    }
    throw new Error('Gave up after ' + tries + ' tries.');
  }
  // One button press. False when it did not go through, as in the app.
  async command(body: Record<string, unknown>) {
    if (this.busy) return false;
    this.busy = true;
    try {
      await this.request(body);
      return true;
    } catch (error) {
      if (!(error instanceof Lost || error instanceof Refused)) throw error;
      return false;
    } finally {
      this.busy = false;
    }
  }
  async poll() {
    let wait = 650;
    while (!this.stopped) {
      try {
        const { room } = await this.request();
        wait = room.phase === 'playing' && (room.game === 'turbo' || room.game === 'reaction') ? 250 : 650;
      } catch (error) {
        if (error instanceof Refused && [401, 403, 404, 410].includes(error.status)) {
          this.expired = true;
          return;
        }
        if (!(error instanceof Lost || error instanceof Refused)) throw error;
      }
      await this.world.sleep(wait);
    }
  }
  stop() {
    this.stopped = true;
  }
  get me() {
    return this.room?.players.find((p) => p.id === this.id);
  }
  async until(ready: () => boolean, limitMs: number, what: string) {
    const end = this.world.now() + limitMs;
    while (!ready()) {
      if (this.world.now() > end)
        throw new Error(
          'Timed out waiting for ' + what + '; phase ' + this.room?.phase + ' round ' + this.room?.round,
        );
      await this.world.sleep(20);
    }
  }
}

// Drinking games need the host to be signed in with an 18+ profile.
async function adultCookie(world: World) {
  const response = await world.server('/api/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'register',
      name: 'Sim ' + Math.floor(world.now() + world.random() * 1e9).toString(36),
      password: 'only for simulations',
      birthday: '1990-01-01',
    }),
  });
  const cookie = response.headers.get('set-cookie');
  if (!cookie) throw new Error('Could not sign in: ' + (await response.text()));
  return cookie.split(';')[0];
}
// A host screen and its phones, all polling.
export async function openTable(
  world: World,
  game: string,
  phoneLinks: Link[],
  rounds = 3,
  watch: Phone['watch'] = () => {},
) {
  const stats = newStats();
  const cookie = adultGames.includes(game) ? await adultCookie(world) : '';
  const made = await world.server('/api/rooms', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ game, rounds }),
  });
  const { code, hostToken } = (await made.json()) as { code: string; hostToken: string };
  const host = new Phone(world, code, links.wifi, stats);
  host.token = hostToken;
  const phones = phoneLinks.map(
    (link, i) => new Phone(world, code, link, stats, Math.round((world.random() - 0.5) * 600_000) * (i % 2)),
  );
  for (const device of [host, ...phones]) device.watch = watch;
  const loops: Promise<void>[] = [host.poll()];
  await Promise.all(
    phones.map(async (phone, i) => {
      await phone.enter('P' + i);
      loops.push(phone.poll());
    }),
  );
  return {
    world,
    host,
    phones,
    stats,
    code,
    async start() {
      await host.keepTrying(() => host.request({ action: 'start' }));
      await Promise.all(phones.map((p) => p.until(() => p.room?.phase === 'playing', 15_000, 'the start')));
    },
    async close() {
      for (const device of [host, ...phones]) device.stop();
      await Promise.all(loops);
    },
  };
}
export type Table = Awaited<ReturnType<typeof openTable>>;
