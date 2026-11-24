import { beforeEach, describe, expect, it } from 'vitest';
import { passwordHash } from '../lib/server/profiles';
import { GET as afterHours } from '../app/api/after-hours/route';
import { GET as whoAmI, POST as account } from '../app/api/profile/route';
import { cookieFrom, get, json, post } from './api-helpers';
import { useDatabase } from './database';

let sqlite: ReturnType<typeof useDatabase>;
beforeEach(() => {
  sqlite = useDatabase();
});

const adult = {
  action: 'register',
  name: 'Sam',
  password: 'correct horse',
  birthday: '1990-05-17',
  avatar: '🐼',
};
const register = (extra: Record<string, unknown> = {}) =>
  account(post('/api/profile', { ...adult, ...extra }));

describe('registering', () => {
  it('creates a profile, signs in with a cookie and never reveals the birth date', async () => {
    const response = await register();
    const body = await json(response);
    expect(response.status).toBe(200);
    expect(body.profile).toMatchObject({ name: 'Sam', avatar: '🐼', adult: true });
    expect(JSON.stringify(body)).not.toMatch(/1990|hash|salt/);
    const cookie = response.headers.get('set-cookie')!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(
      (await json(await whoAmI(get('/api/profile', { cookie: cookieFrom(response) })))).profile.name,
    ).toBe('Sam');
  });
  it('stores a salted hash, not the password', async () => {
    await register();
    await register({ name: 'Tess' });
    const rows = sqlite.prepare('SELECT * FROM profiles ORDER BY name').all() as Record<string, string>[];
    expect(JSON.stringify(rows)).not.toContain('correct horse');
    expect(rows[0].password_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].salt).not.toBe(rows[1].salt);
    expect(rows[0].password_hash).not.toBe(rows[1].password_hash);
  });
  it('rejects a name that is taken, ignoring case', async () => {
    await register();
    const response = await register({ name: 'SAM' });
    expect(response.status).toBe(409);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
  it.each([
    ['a short password', { password: 'short' }],
    ['no name', { name: '  ' }],
    ['a name over 32 characters', { name: 'x'.repeat(33) }],
    ['an impossible date', { birthday: '2001-02-30' }],
    ['a date in the future', { birthday: '2999-01-01' }],
    ['a date before 1900', { birthday: '1899-12-31' }],
    ['a date in the wrong format', { birthday: '17/05/1990' }],
  ])('rejects %s', async (_label, change) => {
    expect((await register(change)).status).toBe(400);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM profiles').get()).toEqual({ n: 0 });
  });
  it('falls back to a safe avatar', async () => {
    expect((await json(await register({ avatar: '<script>' }))).profile.avatar).toBe('🦊');
  });
  it('needs a JSON body', async () => {
    const response = await account(
      new Request('http://localhost/api/profile', {
        method: 'POST',
        body: 'x',
        headers: { 'content-type': 'text/plain' },
      }),
    );
    expect(response.status).toBe(415);
  });
});

describe('password hashing', () => {
  // Changing these settings would make every stored password stop working.
  it('keeps producing the same hash for the same password and salt', async () => {
    expect(await passwordHash('correct horse', 'fixed-salt')).toBe(
      '331198d757fc3882192fc25358d4dd74032ed24232c1d64791ad5ba5d20201ed',
    );
  });
});

describe('signing in and out', () => {
  it('accepts the right password and rejects wrong ones the same way as unknown names', async () => {
    await register();
    const ok = await account(
      post('/api/profile', { action: 'login', name: 'sam', password: 'correct horse' }),
    );
    expect(ok.status).toBe(200);
    const wrong = await account(
      post('/api/profile', { action: 'login', name: 'Sam', password: 'wrong password' }),
    );
    const unknown = await account(
      post('/api/profile', { action: 'login', name: 'Nobody', password: 'wrong password' }),
    );
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(await json(wrong)).toEqual(await json(unknown));
  });
  it('ends the session on sign-out', async () => {
    const cookie = cookieFrom(await register());
    const out = await account(post('/api/profile', { action: 'logout' }, { cookie }));
    expect(out.headers.get('set-cookie')).toMatch(/Max-Age=0/);
    expect((await json(await whoAmI(get('/api/profile', { cookie })))).profile).toBeNull();
  });
  it('ignores expired and made-up sessions', async () => {
    const cookie = cookieFrom(await register());
    expect(
      (await json(await whoAmI(get('/api/profile', { cookie: 'pt_profile=made-up' })))).profile,
    ).toBeNull();
    sqlite.prepare('UPDATE profile_sessions SET expires = 1').run();
    expect((await json(await whoAmI(get('/api/profile', { cookie })))).profile).toBeNull();
  });
  it('clears expired sessions on the next sign-in', async () => {
    await register();
    sqlite.prepare('UPDATE profile_sessions SET expires = 1').run();
    await account(post('/api/profile', { action: 'login', name: 'Sam', password: 'correct horse' }));
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM profile_sessions').get()).toEqual({ n: 1 });
  });
  it('rejects unknown actions', async () => {
    expect(
      (await account(post('/api/profile', { action: 'delete', name: 'Sam', password: 'correct horse' })))
        .status,
    ).toBe(400);
  });
});

describe('18+ shelf', () => {
  it('opens for adults only', async () => {
    const grown = cookieFrom(await register());
    const child = cookieFrom(await register({ name: 'Kid', birthday: '2015-03-01' }));
    expect((await afterHours(get('/api/after-hours', { cookie: grown }))).status).toBe(200);
    expect((await afterHours(get('/api/after-hours', { cookie: child }))).status).toBe(403);
    expect((await afterHours(get('/api/after-hours'))).status).toBe(403);
  });
  it('counts someone as an adult on their 18th birthday, not the day before', async () => {
    const day = (offset: number) => {
      const d = new Date();
      d.setUTCFullYear(d.getUTCFullYear() - 18);
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };
    expect((await json(await register({ name: 'Today', birthday: day(0) }))).profile.adult).toBe(true);
    expect((await json(await register({ name: 'Tomorrow', birthday: day(1) }))).profile.adult).toBe(false);
  });
});
