import { beforeEach, describe, expect, it } from 'vitest';
import { GET as viewRoom, POST as roomPost } from '../app/api/rooms/[code]/route';
import { POST as createRoute } from '../app/api/rooms/route';
import { withSecurityHeaders } from '../lib/server/security-headers';
import { get, json, post } from './api-helpers';
import { useDatabase } from './database';

beforeEach(() => {
  useDatabase();
});

const home = { 'cf-connecting-ip': '203.0.113.20' };
const elsewhere = { 'cf-connecting-ip': '203.0.113.21' };
const ctx = (code: string) => ({ params: Promise.resolve({ code }) });
const create = (headers: Record<string, string> = home) =>
  createRoute(post('/api/rooms', { game: 'quiz' }, headers));
const join = (code: string, name: string, headers: Record<string, string> = home) =>
  roomPost(post('/api/rooms/' + code, { action: 'join', name }, headers), ctx(code));
const view = (code: string, headers: Record<string, string> = home) =>
  viewRoom(get('/api/rooms/' + code, headers), ctx(code));
// Retry-After is the real wait. The test may take a few seconds to get here.
const expectWait = (response: Response, minutes: number) => {
  const seconds = Number(response.headers.get('retry-after'));
  expect(seconds).toBeLessThanOrEqual(minutes * 60);
  expect(seconds).toBeGreaterThan(minutes * 60 - 30);
};
async function room() {
  const created = await json(await create());
  return created.code as string;
}

describe('room limits', () => {
  it('let a household of 12 phones on one address join one room', async () => {
    const code = await room();
    for (let i = 1; i <= 12; i++) expect((await join(code, 'Phone ' + i)).status).toBe(200);
  });

  it('limit one address to 60 joins in 10 minutes, wherever they go', async () => {
    const code = await room();
    for (let i = 1; i <= 60; i++) expect((await join(code, 'Phone ' + i)).status).not.toBe(429);
    const limited = await join(code, 'One more');
    expect(limited.status).toBe(429);
    expect((await json(limited)).error).toMatch(/Too many joins/);
    expectWait(limited, 10);
    const nextDoor = await json(await create(elsewhere));
    expect((await join(nextDoor.code, 'Next door', elsewhere)).status).toBe(200);
  });

  it('limit one address to 30 new rooms an hour', async () => {
    for (let i = 0; i < 30; i++) expect((await create()).status).toBe(201);
    const limited = await create();
    expect(limited.status).toBe(429);
    expectWait(limited, 60);
    expect((await create(elsewhere)).status).toBe(201);
  });

  it('stop an address guessing codes, without blocking phones already in a room', async () => {
    const code = await room();
    const ana = await json(await join(code, 'Ana'));
    for (let i = 0; i < 60; i++) expect((await view('ZZZZ')).status).toBe(404);
    const guessing = await view(code);
    expect(guessing.status).toBe(429);
    expect((await json(guessing)).error).toMatch(/wrong room codes/);
    expectWait(guessing, 10);
    const phone = await view(code, { ...home, authorization: 'Bearer ' + ana.playerToken });
    expect(phone.status).toBe(200);
  });

  it('give a made-up token the same answer for a real room and a wrong code, once guessing is blocked', async () => {
    const code = await room();
    const made = { ...home, authorization: 'Bearer made-up' };
    // Before the block, a made-up token learns nothing new either: no seat and no room both fail.
    for (let i = 0; i < 60; i++) expect((await view('ZZZZ', made)).status).toBe(404);
    const real = await view(code, made);
    const wrong = await view('ZZZY', made);
    expect([real.status, wrong.status]).toEqual([429, 429]);
    expect(await json(real)).toEqual(await json(wrong));
    expectWait(real, 10);
  });

  it('limit nothing on this machine, where there is no Cloudflare address', async () => {
    const code = await room();
    for (let i = 1; i <= 70; i++) expect((await join(code, 'Phone ' + i, {})).status).not.toBe(429);
    for (let i = 0; i < 70; i++) expect((await view('ZZZZ', {})).status).toBe(404);
  });
});

describe('security headers', () => {
  it('go on every page and API reply, without replacing ones already set', async () => {
    const res = withSecurityHeaders(
      new Response('{}', {
        headers: { 'Content-Type': 'application/json', 'X-Frame-Options': 'SAMEORIGIN' },
      }),
      true,
    );
    expect(Object.fromEntries(res.headers)).toMatchObject({
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-frame-options': 'SAMEORIGIN',
      'content-security-policy': expect.stringContaining("frame-ancestors 'none'"),
      'permissions-policy': expect.stringContaining('camera=()'),
      'strict-transport-security': 'max-age=31536000',
      'content-type': 'application/json',
    });
    expect(await res.text()).toBe('{}');
  });

  it('keep the motion sensors allowed, and HSTS off plain HTTP', () => {
    const res = withSecurityHeaders(new Response('page', { status: 404 }), false);
    expect(res.status).toBe(404);
    expect(res.headers.get('permissions-policy')).not.toMatch(/accelerometer|gyroscope|magnetometer/);
    expect(res.headers.has('strict-transport-security')).toBe(false);
  });

  it('leave a WebSocket handshake as it is', () => {
    const handshake = { status: 101 } as Response;
    expect(withSecurityHeaders(handshake, true)).toBe(handshake);
  });
});
