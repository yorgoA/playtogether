import { describe, expect, it, vi } from 'vitest';
import worker from '../worker/index';
import { gatePath } from '../lib/server/staging-gate';
import { cookieFrom } from './api-helpers';

vi.mock('vinext/server/fetch-handler', () => ({ default: { fetch: () => new Response('app') } }));

const site = 'https://staging.example';
const password = 'four random words here';
const rooms = { idFromName: (name: string) => name, get: () => ({ fetch: () => new Response('room') }) };
const env = (extra: Record<string, unknown> = {}) =>
  ({ ROOM_HOST: 'durable', ROOMS: rooms, ...extra }) as unknown as Cloudflare.Env;
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
});
