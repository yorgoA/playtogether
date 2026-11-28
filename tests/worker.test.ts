import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker from '../worker/index';
import { gatePath } from '../lib/server/staging-gate';
import { GET as roomRoute } from '../app/api/rooms/[code]/route';
import { cookieFrom, get } from './api-helpers';
import { useDatabase } from './database';

vi.mock('vinext/server/fetch-handler', () => ({ default: { fetch: () => new Response('app') } }));

const site = 'https://staging.example';
const password = 'four random words here';
const rooms = { idFromName: (name: string) => name, get: () => ({ fetch: () => new Response('room') }) };
const env = (extra: Record<string, unknown> = {}) =>
  ({ ROOM_HOST: 'durable', ROOMS: rooms, ...extra }) as unknown as Cloudflare.Env;
const ctx = (code: string) => ({ params: Promise.resolve({ code }) });
const call = (path: string, e: Cloudflare.Env, headers: Record<string, string> = {}) =>
  worker.fetch(new Request(site + path, { headers }), e, {} as ExecutionContext);

describe('Worker entry', () => {
  it('sends a room socket to its Durable Object, and the rest to the app', async () => {
    expect(await (await call('/api/rooms/ABCD/live', env())).text()).toBe('room');
    expect(await (await call('/api/rooms/ABCD', env())).text()).toBe('app');
  });

  it('asks for the staging password before a room socket too', async () => {
    const locked = env({ STAGING_PASSWORD: password });
    expect((await call('/api/rooms/ABCD/live', locked)).status).toBe(401);
    const signedIn = await worker.fetch(
      new Request(site + gatePath, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ password, next: '/' }),
      }),
      locked,
      {} as ExecutionContext,
    );
    const cookie = cookieFrom(signedIn);
    expect(await (await call('/api/rooms/ABCD/live', locked, { cookie })).text()).toBe('room');
  });

  it('adds the security headers to what the room answers', async () => {
    const res = await call('/api/rooms/ABCD/live', env());
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('strict-transport-security')).toBe('max-age=31536000');
  });
});

describe('Room sockets per address', () => {
  beforeEach(() => {
    useDatabase();
  });
  const home = { 'cf-connecting-ip': '203.0.113.30' };

  it('refuses a socket to an address that guessed codes', async () => {
    for (let i = 0; i < 60; i++)
      expect((await roomRoute(get('/api/rooms/ZZZZ', home), ctx('ZZZZ'))).status).toBe(404);
    const refused = await call('/api/rooms/ABCD/live', env(), home);
    expect(refused.status).toBe(429);
    expect(await refused.json()).toEqual({ error: expect.stringMatching(/wrong room codes/) });
    expect(
      await (await call('/api/rooms/ABCD/live', env(), { 'cf-connecting-ip': '203.0.113.31' })).text(),
    ).toBe('room');
  });

  it('lets one address open 120 sockets in 10 minutes, reconnections included', async () => {
    for (let i = 0; i < 120; i++) expect((await call('/api/rooms/ABCD/live', env(), home)).status).toBe(200);
    expect((await call('/api/rooms/ABCD/live', env(), home)).status).toBe(429);
  });
});
