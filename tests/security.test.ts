import { beforeEach, describe, expect, it } from 'vitest';
import { GET as whoAmI, POST as account } from '../app/api/profile/route';
import { POST as createRoom } from '../app/api/rooms/route';
import { readText } from '../lib/server/body';
import { hashToken, sameHash } from '../lib/server/profiles';
import { cookieFrom, get, json, post } from './api-helpers';
import { useDatabase } from './database';

let sqlite: ReturnType<typeof useDatabase>;
beforeEach(() => {
  sqlite = useDatabase();
});

const password = 'correct horse';
const send = (body: unknown, headers: Record<string, string> = {}) =>
  account(post('/api/profile', body, headers));
const register = (name = 'Sam', headers: Record<string, string> = {}) =>
  send({ action: 'register', name, password, birthday: '1990-05-17' }, headers);
const login = (name: string, attempt = password, headers: Record<string, string> = {}) =>
  send({ action: 'login', name, password: attempt }, headers);
// Retry-After must be the real wait. The test may take a few seconds to get here.
const expectWait = (response: Response, minutes: number) => {
  const seconds = Number(response.headers.get('retry-after'));
  expect(seconds).toBeLessThanOrEqual(minutes * 60);
  expect(seconds).toBeGreaterThan(minutes * 60 - 30);
};
const signedIn = async (cookie: string) =>
  (await json(await whoAmI(get('/api/profile', { cookie })))).profile;

describe('session tokens', () => {
  it('are stored as hashes, and a stored hash cannot be used to sign in', async () => {
    const cookie = cookieFrom(await register());
    const raw = cookie.split('=')[1];
    const stored = (sqlite.prepare('SELECT token FROM profile_sessions').get() as { token: string }).token;
    expect(stored).toBe(await hashToken(raw));
    expect(stored).not.toBe(raw);
    expect(await signedIn(cookie)).toMatchObject({ name: 'Sam' });
    expect(await signedIn('pt_profile=' + stored)).toBeNull();
  });
});

describe('requests', () => {
  it.each(['profile', 'rooms'])('stop reading an endless %s body instead of buffering it', async (api) => {
    let chunks = 0;
    let cancelled = false;
    const body = new ReadableStream({
      pull(controller) {
        // A backstop, so a server that reads everything fails this test rather than hanging it.
        if (++chunks > 500) return controller.close();
        controller.enqueue(new TextEncoder().encode('x'.repeat(1000)));
      },
      cancel() {
        cancelled = true;
      },
    });
    const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half' };
    const request = new Request('http://localhost/api/' + api, init as RequestInit);
    const response = await (api === 'profile' ? account : createRoom)(request);
    expect(response.status).toBe(413);
    expect(cancelled).toBe(true);
    expect(chunks).toBeLessThan(10);
  });
  it('read characters split across chunks, and count bytes rather than characters', async () => {
    const bytes = new TextEncoder().encode('{"a":"🦊é"}');
    const body = new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    const request = new Request('http://localhost/', { method: 'POST', body, duplex: 'half' } as RequestInit);
    expect(await readText(request, bytes.length)).toBe('{"a":"🦊é"}');
    const make = () => new Request('http://localhost/', { method: 'POST', body: '🦊🦊' });
    expect(await readText(make(), 8)).toBe('🦊🦊');
    expect(await readText(make(), 7)).toBeNull();
    expect(await readText(new Request('http://localhost/', { method: 'POST' }), 8)).toBe('');
  });
  it('refuse bodies over 2,500 bytes', async () => {
    const response = await send({ action: 'login', name: 'Sam', password: 'x'.repeat(3000) });
    expect(response.status).toBe(413);
  });
  it('refuse another site acting for the player', async () => {
    const blocked = await send(
      { action: 'login', name: 'Sam', password },
      { origin: 'https://evil.example' },
    );
    expect(blocked.status).toBe(403);
    expect((await register('Sam', { origin: 'http://localhost' })).status).toBe(200);
  });
});

describe('guessing passwords', () => {
  beforeEach(async () => {
    await register('Sam');
    await register('Tess');
  });
  it('locks a name after five wrong passwords, even for the right one', async () => {
    for (let i = 0; i < 5; i++) expect((await login('Sam', 'wrong password')).status).toBe(401);
    const locked = await login('sam', password);
    expect(locked.status).toBe(429);
    expectWait(locked, 15);
    expect((await login('Tess')).status).toBe(200);
  });
  it('forgets earlier mistakes after a successful sign-in', async () => {
    for (let i = 0; i < 4; i++) await login('Sam', 'wrong password');
    expect((await login('Sam')).status).toBe(200);
    for (let i = 0; i < 4; i++) expect((await login('Sam', 'wrong password')).status).toBe(401);
  });
  it('lets the name in again once the lock runs out', async () => {
    for (let i = 0; i < 5; i++) await login('Sam', 'wrong password');
    sqlite.prepare('UPDATE rate_limits SET reset_at = 1').run();
    expect((await login('Sam')).status).toBe(200);
  });
  it('counts unknown names too, so names cannot be probed', async () => {
    for (let i = 0; i < 5; i++) await login('Nobody', 'wrong password');
    expect((await login('Nobody', 'wrong password')).status).toBe(429);
  });
  it('limits one address to 30 attempts in 15 minutes', async () => {
    const ip = { 'cf-connecting-ip': '203.0.113.9' };
    for (let i = 0; i < 29; i++) await login('Name' + i, 'wrong password', ip);
    expect((await login('Tess', password, ip)).status).toBe(200);
    const limited = await login('Sam', password, ip);
    expect(limited.status).toBe(429);
    expectWait(limited, 15);
    expect((await login('Sam', password, { 'cf-connecting-ip': '203.0.113.10' })).status).toBe(200);
  });
});

describe('creating profiles', () => {
  it('lets a household make 20 an hour, then refuses more', async () => {
    const ip = { 'cf-connecting-ip': '203.0.113.20' };
    for (let i = 0; i < 20; i++) expect((await register('Kid' + i, ip)).status).toBe(200);
    const limited = await register('Kid20', ip);
    expect(limited.status).toBe(429);
    expectWait(limited, 60);
    expect((await register('Kid20', { 'cf-connecting-ip': '203.0.113.21' })).status).toBe(200);
  });
  it('does not count a profile that was refused for a bad birth date', async () => {
    for (let i = 0; i < 6; i++)
      expect((await send({ action: 'register', name: 'Sam', password, birthday: 'nope' })).status).toBe(400);
    expect((await register('Sam')).status).toBe(200);
  });
  it('clears expired limits', async () => {
    await login('Nobody', 'wrong password');
    sqlite.prepare('UPDATE rate_limits SET reset_at = 1').run();
    await register('Sam');
    expect(sqlite.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE key LIKE 'login:%'").get()).toEqual({
      n: 0,
    });
  });
});

describe('signed-in actions', () => {
  it('need a session', async () => {
    for (const action of ['logoutAll', 'changePassword', 'deleteAccount'])
      expect((await send({ action, password, newPassword: 'another password' })).status).toBe(401);
  });
  it('sign out every device', async () => {
    await register();
    const phone = cookieFrom(await login('Sam'));
    const tv = cookieFrom(await login('Sam'));
    const out = await send({ action: 'logoutAll' }, { cookie: phone });
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect([await signedIn(phone), await signedIn(tv)]).toEqual([null, null]);
  });
  it('change the password, keeping this device and ending the others', async () => {
    await register();
    const phone = cookieFrom(await login('Sam'));
    const tv = cookieFrom(await login('Sam'));
    const body = { action: 'changePassword', password, newPassword: 'a brand new one' };
    expect((await send({ ...body, password: 'wrong password' }, { cookie: phone })).status).toBe(401);
    expect((await send({ ...body, newPassword: 'short' }, { cookie: phone })).status).toBe(400);
    expect((await send(body, { cookie: phone })).status).toBe(200);
    expect(await signedIn(phone)).toMatchObject({ name: 'Sam' });
    expect(await signedIn(tv)).toBeNull();
    expect((await login('Sam', password)).status).toBe(401);
    expect((await login('Sam', 'a brand new one')).status).toBe(200);
  });
  it('check the password with the same lock as signing in', async () => {
    await register();
    const cookie = cookieFrom(await login('Sam'));
    for (let i = 0; i < 5; i++)
      expect((await send({ action: 'deleteAccount', password: 'wrong password' }, { cookie })).status).toBe(
        401,
      );
    expect((await send({ action: 'deleteAccount', password }, { cookie })).status).toBe(429);
  });
  it('delete the account, its sessions and free the name', async () => {
    await register();
    const cookie = cookieFrom(await login('Sam'));
    expect((await send({ action: 'deleteAccount', password: 'wrong password' }, { cookie })).status).toBe(
      401,
    );
    expect((await send({ action: 'deleteAccount', password }, { cookie })).status).toBe(200);
    expect(await signedIn(cookie)).toBeNull();
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM profiles').get()).toEqual({ n: 0 });
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM profile_sessions').get()).toEqual({ n: 0 });
    expect((await register('Sam')).status).toBe(200);
  });
});

describe('sameHash', () => {
  it('compares whole strings', () => {
    expect(sameHash('abc', 'abc')).toBe(true);
    expect(sameHash('abc', 'abd')).toBe(false);
    expect(sameHash('abc', 'ab')).toBe(false);
    expect(sameHash('', '')).toBe(true);
  });
});
