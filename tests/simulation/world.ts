import { env } from 'cloudflare:workers';
import { vi } from 'vitest';
import { POST as account } from '../../app/api/profile/route';
import { GET as viewRoom, POST as commandRoom } from '../../app/api/rooms/[code]/route';
import { POST as createRoom } from '../../app/api/rooms/route';
import { useDatabase as openDatabase } from '../database';

// Where simulated phones live: a clock, randomness, and a way to reach the server.
export type World = {
  now(): number;
  sleep(ms: number): Promise<void>;
  random(): number;
  server(path: string, init: RequestInit): Promise<Response>;
};

// Repeatable randomness, so a failing run can be replayed from its seed.
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const call = (path: string, init: RequestInit) => {
  const request = new Request('http://localhost' + path, init);
  if (path === '/api/profile') return account(request);
  const code = path.split('/')[3];
  if (!code) return createRoom(request);
  const context = { params: Promise.resolve({ code }) };
  return init.method === 'POST' ? commandRoom(request, context) : viewRoom(request, context);
};

// The real route handlers over a real SQLite database, on a virtual clock: minutes of play take seconds.
// Every database call takes virtual time too, so requests overlap and compete the way they do in production.
export function virtualWorld(seed: number, databaseMs = 5) {
  let time = 1_800_000_000_000;
  let order = 0;
  const timers: { at: number; order: number; wake: () => void }[] = [];
  const random = seeded(seed);
  const sleep = (ms: number) =>
    new Promise<void>((wake) => timers.push({ at: time + Math.max(0, ms), order: order++, wake }));
  vi.spyOn(Date, 'now').mockImplementation(() => time);
  vi.spyOn(Math, 'random').mockImplementation(random);

  const sqlite = openDatabase();
  const fast = env.DB!;
  const slow = (statement: D1PreparedStatement): D1PreparedStatement =>
    new Proxy(statement, {
      get(target, key: keyof D1PreparedStatement) {
        if (key === 'bind') return (...values: unknown[]) => slow(target.bind(...values));
        return async () => {
          await sleep(databaseMs * (0.5 + random()));
          return (target[key] as () => Promise<unknown>)();
        };
      },
    });
  // How often a save lost the race against another one and had to be tried again.
  const counts = { saves: 0, conflicts: 0 };
  const watched = (sql: string) => {
    const statement = fast.prepare(sql);
    if (!sql.startsWith('UPDATE rooms')) return statement;
    const wrap = (inner: D1PreparedStatement): D1PreparedStatement =>
      ({
        bind: (...values: unknown[]) => wrap(inner.bind(...values)),
        run: async () => {
          const result = await inner.run();
          counts.saves++;
          if (!result.meta.changes) counts.conflicts++;
          return result;
        },
      }) as unknown as D1PreparedStatement;
    return wrap(statement);
  };
  (env as { DB: unknown }).DB = { ...fast, prepare: (sql: string) => slow(watched(sql)) };

  const world: World = { now: () => time, sleep, random, server: async (path, init) => call(path, init) };

  // Runs `work`, moving the clock only when nothing is left to do at the current moment.
  async function run<T>(work: () => Promise<T>, limitMs = 60 * 60_000): Promise<T> {
    const end = time + limitMs;
    let done = false;
    let idle = 0;
    const result = work().finally(() => {
      done = true;
    });
    result.catch(() => {});
    while (!done) {
      for (let i = 0; i < 3; i++) await new Promise((r) => setImmediate(r));
      if (done) break;
      timers.sort((a, b) => a.at - b.at || a.order - b.order);
      const next = timers.shift();
      if (!next) {
        // Hashing runs outside the virtual clock, so give it a moment of real time.
        if (++idle > 400) throw new Error('The simulation is stuck: nothing is waiting to happen.');
        await new Promise((r) => setTimeout(r, 5));
        continue;
      }
      idle = 0;
      if (next.at > end) throw new Error('The simulation did not finish in time.');
      time = Math.max(time, next.at);
      next.wake();
    }
    return result;
  }
  return { ...world, run, sqlite, counts };
}

// The same phones against a running server, in real time.
export function liveWorld(url: string, seed: number): World {
  return {
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms))),
    random: seeded(seed),
    server: (path, init) => fetch(url + path, init),
  };
}
