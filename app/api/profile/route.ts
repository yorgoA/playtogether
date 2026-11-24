import { env } from 'cloudflare:workers';
import { current, passwordHash, publicProfile, reply, sessionCookie, token } from '@/lib/server/profiles';

export async function GET(req: Request) {
  return reply({ profile: publicProfile(await current(req)) });
}
export async function POST(req: Request) {
  if (req.headers.get('content-type')?.split(';')[0] !== 'application/json')
    return reply({ error: 'Send JSON.' }, 415);
  const data = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data) return reply({ error: 'Invalid request.' }, 400);
  if (data.action === 'logout') {
    await env.DB.prepare('DELETE FROM profile_sessions WHERE token=?').bind(token(req)).run();
    return reply({ profile: null }, 200, { 'Set-Cookie': sessionCookie(req, '', 0) });
  }
  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (
    !name ||
    name.length > 32 ||
    typeof data.password !== 'string' ||
    data.password.length < 8 ||
    data.password.length > 128
  )
    return reply({ error: 'Use a name and a password of 8–128 characters.' }, 400);
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
    const salt = crypto.randomUUID();
    const avatar =
      typeof data.avatar === 'string' && ['🦊', '🐼', '🐙', '🦉'].includes(data.avatar) ? data.avatar : '🦊';
    const result = await env.DB.prepare('INSERT OR IGNORE INTO profiles VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(), name, dob, avatar, salt, await passwordHash(data.password, salt))
      .run();
    if (!result.meta.changes) return reply({ error: 'That profile name is taken.' }, 409);
  } else if (data.action !== 'login') return reply({ error: 'Unknown action.' }, 400);
  const p = await env.DB.prepare('SELECT * FROM profiles WHERE name=?').bind(name).first<{
    id: string;
    name: string;
    birthday: string;
    avatar: string;
    salt: string;
    password_hash: string;
  }>();
  if (!p || (await passwordHash(data.password, p.salt)) !== p.password_hash)
    return reply({ error: 'Incorrect name or password.' }, 401);
  const session = crypto.randomUUID(),
    seconds = 86400;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM profile_sessions WHERE expires<=? OR token=?').bind(Date.now(), token(req)),
    env.DB.prepare('INSERT INTO profile_sessions VALUES(?,?,?)').bind(
      session,
      p.id,
      Date.now() + seconds * 1000,
    ),
  ]);
  return reply({ profile: publicProfile(p) }, 200, { 'Set-Cookie': sessionCookie(req, session, seconds) });
}
