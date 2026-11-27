import { describe, expect, it } from 'vitest';
import { gatePath, stagingGate } from '../lib/server/staging-gate';
import { cookieFrom, get } from './api-helpers';

const password = 'correct horse battery staple';
const site = 'https://staging.example';
const at = (path: string, headers: Record<string, string> = {}) => new Request(site + path, { headers });
const signIn = (given: string, next = '/') =>
  stagingGate(
    new Request(site + gatePath, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password: given, next }),
    }),
    password,
  );

describe('staging password', () => {
  it('lets everything through when no password is set', async () => {
    expect(await stagingGate(get('/'), undefined)).toBeNull();
    expect(await stagingGate(get('/api/rooms'), '')).toBeNull();
  });

  it('sends a page to the sign-in form, keeping where it was going', async () => {
    const res = (await stagingGate(at('/join?code=ABCD'), password))!;
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe(gatePath + '?next=' + encodeURIComponent('/join?code=ABCD'));
  });

  it('refuses API calls without the cookie, even with a room token', async () => {
    const res = (await stagingGate(at('/api/rooms/ABCD', { authorization: 'Bearer token' }), password))!;
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: expect.any(String) });
  });

  it('shows the form with the escaped destination', async () => {
    const res = (await stagingGate(at(gatePath + '?next=' + encodeURIComponent('/"><script>')), password))!;
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('name="password"');
    expect(html).toContain('value="/&quot;&gt;&lt;script&gt;"');
    expect(html).not.toContain('"><script>');
  });

  it('keeps a wrong password out without a cookie', async () => {
    const res = (await signIn('guess'))!;
    expect(res.status).toBe(401);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(await res.text()).toContain('Wrong password.');
  });

  it('lets pages and the API through once the right password is given', async () => {
    const res = (await signIn(password, '/join?code=ABCD'))!;
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toBe('/join?code=ABCD');
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Lax; Max-Age=\d+; Secure$/);
    const cookie = cookieFrom(res);
    expect(cookie).not.toContain(password);
    expect(await stagingGate(at('/', { cookie }), password)).toBeNull();
    expect(await stagingGate(at('/api/rooms', { cookie: 'theme=dark; ' + cookie }), password)).toBeNull();
  });

  it('signs everyone out when the password changes', async () => {
    const cookie = cookieFrom((await signIn(password))!);
    expect((await stagingGate(at('/', { cookie }), 'a new password'))!.status).toBe(302);
  });

  it('only sends people back to a path on this site', async () => {
    for (const next of ['//evil.example', 'https://evil.example', '/\\evil.example'])
      expect((await signIn(password, next))!.headers.get('location')).toBe('/');
  });
});
