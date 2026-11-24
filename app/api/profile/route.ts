import { env } from 'cloudflare:workers';
import {
  client,
  current,
  exhausted,
  forget,
  hashToken,
  hit,
  minute,
  passwordHash,
  publicProfile,
  readJson,
  reply,
  sameHash,
  sameOrigin,
  sessionCookie,
  token,
} from '@/lib/server/profiles';

type Row = {
  id: string;
  name: string;
  birthday: string;
  avatar: string;
  salt: string;
  password_hash: string;
};
const sessionSeconds = 86400;
const avatars = ['🦊', '🐼', '🐙', '🦉'];
// Wrong passwords allowed for one name, and requests from one address, in 15 minutes.
const wrongPasswords = 5;
const perAddress = 30;
const window = 15 * minute;
// New profiles from one address in an hour. Everyone on one Wi-Fi shares an address.
const registrations = 20;

const tooMany = (seconds: number) =>
  reply({ error: 'Too many attempts. Try again later.' }, 429, {
    'Retry-After': String(Math.max(1, seconds)),
  });
const signedOut = (req: Request) => ({ 'Set-Cookie': sessionCookie(req, '', 0) });
const validPassword = (value: unknown): value is string =>
  typeof value === 'string' && value.length >= 8 && value.length <= 128;

// Checks a password, counting wrong guesses per name. An unknown name costs the same time as a wrong password.
async function guess(row: Row | null, password: string, key: string) {
  const wait = await exhausted(key, wrongPasswords);
  if (wait) return { wait, good: false };
  const good = row
    ? sameHash(await passwordHash(password, row.salt), row.password_hash)
    : (await passwordHash(password, 'unknown-profile'), false);
  if (good) await forget(key);
  else await hit(key, wrongPasswords, window);
  return { wait: 0, good };
}
async function startSession(req: Request, profile: Row | Omit<Row, 'salt' | 'password_hash'>) {
  const session = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM profile_sessions WHERE expires<=? OR token=?').bind(
      Date.now(),
      await hashToken(token(req)),
    ),
    env.DB.prepare('INSERT INTO profile_sessions VALUES(?,?,?)').bind(
      await hashToken(session),
      profile.id,
      Date.now() + sessionSeconds * 1000,
    ),
  ]);
  return reply({ profile: publicProfile(profile) }, 200, {
    'Set-Cookie': sessionCookie(req, session, sessionSeconds),
  });
}

export async function GET(req: Request) {
  return reply({ profile: publicProfile(await current(req)) });
}
export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply({ error: 'Request not allowed.' }, 403);
  if (req.headers.get('content-type')?.split(';')[0] !== 'application/json')
    return reply({ error: 'Send JSON.' }, 415);
  const data = await readJson(req);
  if (data === 'tooLarge') return reply({ error: 'Request too large.' }, 413);
  if (!data) return reply({ error: 'Invalid request.' }, 400);

  if (data.action === 'logout') {
    await env.DB.prepare('DELETE FROM profile_sessions WHERE token=?')
      .bind(await hashToken(token(req)))
      .run();
    return reply({ profile: null }, 200, signedOut(req));
  }

  // Actions for someone who is signed in. Changing or deleting also asks for the password again.
  if (['logoutAll', 'changePassword', 'deleteAccount'].includes(String(data.action))) {
    const who = await current(req);
    if (!who) return reply({ error: 'Sign in first.' }, 401);
    if (data.action === 'logoutAll') {
      await env.DB.prepare('DELETE FROM profile_sessions WHERE profile_id=?').bind(who.id).run();
      return reply({ profile: null }, 200, signedOut(req));
    }
    if (
      !validPassword(data.password) ||
      (data.action === 'changePassword' && !validPassword(data.newPassword))
    )
      return reply({ error: 'Use a password of 8–128 characters.' }, 400);
    const row = await env.DB.prepare('SELECT * FROM profiles WHERE id=?').bind(who.id).first<Row>();
    const check = await guess(row, data.password, 'login:name:' + who.name.toLowerCase());
    if (check.wait) return tooMany(check.wait);
    if (!check.good) return reply({ error: 'Incorrect password.' }, 401);
    if (data.action === 'deleteAccount') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM profile_sessions WHERE profile_id=?').bind(who.id),
        env.DB.prepare('DELETE FROM profiles WHERE id=?').bind(who.id),
      ]);
      return reply({ profile: null }, 200, signedOut(req));
    }
    const salt = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('UPDATE profiles SET salt=?, password_hash=? WHERE id=?').bind(
        salt,
        await passwordHash(data.newPassword as string, salt),
        who.id,
      ),
      // Other devices must sign in again with the new password.
      env.DB.prepare('DELETE FROM profile_sessions WHERE profile_id=? AND token<>?').bind(
        who.id,
        await hashToken(token(req)),
      ),
    ]);
    return reply({ profile: publicProfile(who) });
  }

  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name || name.length > 32 || !validPassword(data.password))
    return reply({ error: 'Use a name and a password of 8–128 characters.' }, 400);
  if (data.action !== 'register' && data.action !== 'login') return reply({ error: 'Unknown action.' }, 400);

  const address = await hit('account:ip:' + client(req), perAddress, window);
  if (!address.allowed) return tooMany(address.retryAfter);

  if (data.action === 'register') {
    const dob = data.birthday;
    const date = new Date(String(dob) + 'T00:00:00Z');
    if (
      typeof dob !== 'string' ||
      !/^\d{4}-\d\d-\d\d$/.test(dob) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== dob ||
      date.getTime() > Date.now() ||
      dob < '1900-01-01'
    )
      return reply({ error: 'Enter a valid birth date.' }, 400);
    const created = await hit('register:ip:' + client(req), registrations, 60 * minute);
    if (!created.allowed) return tooMany(created.retryAfter);
    await env.DB.prepare('DELETE FROM rate_limits WHERE reset_at<=?').bind(Date.now()).run();
    const salt = crypto.randomUUID();
    const avatar =
      typeof data.avatar === 'string' && avatars.includes(data.avatar) ? data.avatar : avatars[0];
    const id = crypto.randomUUID();
    const result = await env.DB.prepare('INSERT OR IGNORE INTO profiles VALUES(?,?,?,?,?,?)')
      .bind(id, name, dob, avatar, salt, await passwordHash(data.password, salt))
      .run();
    if (!result.meta.changes) return reply({ error: 'That profile name is taken.' }, 409);
    return startSession(req, { id, name, birthday: dob, avatar });
  }

  const row = await env.DB.prepare('SELECT * FROM profiles WHERE name=?').bind(name).first<Row>();
  const check = await guess(row, data.password, 'login:name:' + name.toLowerCase());
  if (check.wait) return tooMany(check.wait);
  if (!row || !check.good) return reply({ error: 'Incorrect name or password.' }, 401);
  return startSession(req, row);
}
