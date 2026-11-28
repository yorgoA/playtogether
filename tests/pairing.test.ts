import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as whoAmI, POST as account } from '../app/api/profile/route';
import { PairStartResponse, ProfileResponse } from '../lib/contract';
import { cookieFrom, get, json, post } from './api-helpers';
import { useDatabase } from './database';

// A real date: sign-up refuses a birth date after the clock.
const T0 = Date.UTC(2026, 10, 28, 12);
let sqlite: ReturnType<typeof useDatabase>;
beforeEach(() => {
  sqlite = useDatabase();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => vi.useRealTimers());

const send = (body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  account(post('/api/profile', body, headers));
async function phone(name = 'Sam', birthday = '1990-05-17') {
  const signedUp = await send({ action: 'register', name, password: 'correct horse', birthday });
  return cookieFrom(signedUp);
}
async function tv(headers: Record<string, string> = {}) {
  const started = await send({ action: 'pairStart' }, headers);
  const body = PairStartResponse.parse(await json(started));
  return {
    ...body,
    status: started.status,
    cookie: cookieFrom(started),
    setCookie: started.headers.get('set-cookie')!,
  };
}
const claim = (cookie: string) => send({ action: 'pairClaim' }, { cookie });
const approve = (code: string, cookie: string) => send({ action: 'pairApprove', code }, { cookie });

describe('signing a TV in from a phone', () => {
  it('waits for a phone, then gives the TV a 90-day session for that profile', async () => {
    const screen = await tv();
    expect(screen.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(screen.expiresAt).toBe(T0 + 300_000);
    expect(screen.setCookie).toMatch(
      /^pt_pair=[^;]+; Path=\/api\/profile; HttpOnly; SameSite=Strict; Max-Age=300/,
    );
    // The secret is never in the body, and only its hash is stored.
    const secret = screen.cookie.split('=')[1];
    expect(JSON.stringify({ code: screen.code, expiresAt: screen.expiresAt })).not.toContain(secret);
    expect(JSON.stringify(sqlite.prepare('SELECT * FROM device_pairings').all())).not.toContain(secret);

    const waiting = await claim(screen.cookie);
    expect(waiting.status).toBe(202);
    expect(ProfileResponse.parse(await json(waiting))).toEqual({ profile: null });

    const sam = await phone();
    const approved = await approve(screen.code.toLowerCase(), sam);
    expect(approved.status).toBe(200);
    expect(ProfileResponse.parse(await json(approved)).profile).toMatchObject({ name: 'Sam' });

    const signedIn = await claim(screen.cookie);
    expect(signedIn.status).toBe(200);
    expect(ProfileResponse.parse(await json(signedIn)).profile).toMatchObject({ name: 'Sam', adult: true });
    expect(signedIn.headers.get('set-cookie')).toMatch(/^pt_profile=[^;]+;.*Max-Age=7776000/);
    const theTv = cookieFrom(signedIn);
    expect((await json(await whoAmI(get('/api/profile', { cookie: theTv })))).profile).toMatchObject({
      name: 'Sam',
      adult: true,
    });
    // One code signs in one TV, once.
    expect((await claim(screen.cookie)).status).toBe(410);
  });

  it('tells the TV whether its profile is an adult', async () => {
    const screen = await tv();
    await approve(screen.code, await phone('Kid', '2015-01-01'));
    expect((await json(await claim(screen.cookie))).profile).toMatchObject({ name: 'Kid', adult: false });
  });

  it('gives nothing to someone who only knows the code', async () => {
    const screen = await tv();
    await approve(screen.code, await phone());
    const elsewhere = await claim('pt_pair=' + crypto.randomUUID());
    expect(elsewhere.status).toBe(410);
    expect(elsewhere.headers.get('set-cookie')).toMatch(/^pt_pair=; .*Max-Age=0/);
    expect((await claim(screen.cookie)).status).toBe(200);
  });

  it('needs a signed-in phone, and lets one phone approve a code only once', async () => {
    const screen = await tv();
    expect((await approve(screen.code, '')).status).toBe(401);
    expect((await approve(screen.code, await phone('Sam'))).status).toBe(200);
    const late = await approve(screen.code, await phone('Tess'));
    expect(late.status).toBe(404);
    expect((await json(await claim(screen.cookie))).profile).toMatchObject({ name: 'Sam' });
  });

  it('lets a code expire after five minutes, unapproved or not', async () => {
    const unapproved = await tv();
    const approved = await tv();
    const sam = await phone();
    await approve(approved.code, sam);
    vi.setSystemTime(T0 + 300_000);
    expect((await approve(unapproved.code, sam)).status).toBe(404);
    expect((await claim(unapproved.cookie)).status).toBe(410);
    expect((await claim(approved.cookie)).status).toBe(410);
  });

  it('signs the TV out with "log out everywhere", and drops a code approved but not claimed yet', async () => {
    const sam = await phone();
    const first = await tv();
    await approve(first.code, sam);
    const theTv = cookieFrom(await claim(first.cookie));
    const second = await tv();
    await approve(second.code, sam);
    await send({ action: 'logoutAll' }, { cookie: sam });
    expect((await json(await whoAmI(get('/api/profile', { cookie: theTv })))).profile).toBeNull();
    expect((await claim(second.cookie)).status).toBe(410);
  });

  it('drops approved codes with the account', async () => {
    const sam = await phone();
    const screen = await tv();
    await approve(screen.code, sam);
    await send({ action: 'deleteAccount', password: 'correct horse' }, { cookie: sam });
    expect(sqlite.prepare('SELECT * FROM device_pairings').all()).toEqual([]);
    expect((await claim(screen.cookie)).status).toBe(410);
  });

  it('limits one address to 10 new codes and 10 approvals in 15 minutes', async () => {
    const home = { 'cf-connecting-ip': '203.0.113.40' };
    for (let i = 0; i < 10; i++) expect((await send({ action: 'pairStart' }, home)).status).toBe(200);
    const tooMany = await send({ action: 'pairStart' }, home);
    expect(tooMany.status).toBe(429);
    expect(Number(tooMany.headers.get('retry-after'))).toBe(15 * 60);
    expect((await send({ action: 'pairStart' }, { 'cf-connecting-ip': '203.0.113.41' })).status).toBe(200);

    const sam = await phone('Sam');
    for (let i = 0; i < 10; i++)
      expect((await send({ action: 'pairApprove', code: 'ZZZZZZ' }, { cookie: sam, ...home })).status).toBe(
        404,
      );
    expect((await send({ action: 'pairApprove', code: 'ZZZZZZ' }, { cookie: sam, ...home })).status).toBe(
      429,
    );
  });
});
