import { env } from 'cloudflare:workers';

type Profile = { id: string; name: string; birthday: string; avatar: string };
const cookie = 'pt_profile';
const hex = (bytes: ArrayBuffer) =>
  Array.from(new Uint8Array(bytes), (v) => v.toString(16).padStart(2, '0')).join('');

export function token(req: Request) {
  return (
    req.headers
      .get('cookie')
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith(cookie + '='))
      ?.slice(cookie.length + 1) || ''
  );
}
// Only this hash is stored, so a leaked database cannot be used to sign in.
export async function hashToken(value: string) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}
export function sessionCookie(req: Request, value: string, seconds: number) {
  return (
    cookie +
    '=' +
    value +
    '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' +
    seconds +
    (new URL(req.url).protocol === 'https:' ? '; Secure' : '')
  );
}
export const reply = (value: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(value, { status, headers: { 'Cache-Control': 'private, no-store', ...headers } });
export async function current(req: Request) {
  const value = token(req);
  if (!value) return null;
  return env.DB.prepare(
    'SELECT p.id,p.name,p.birthday,p.avatar FROM profiles p JOIN profile_sessions s ON s.profile_id=p.id WHERE s.token=? AND s.expires>?',
  )
    .bind(await hashToken(value), Date.now())
    .first<Profile>();
}
export function publicProfile(p: Profile | null) {
  if (!p) return null;
  const today = new Date().toISOString().slice(0, 10);
  const cutoff = String(Number(today.slice(0, 4)) - 18) + today.slice(4);
  return { id: p.id, name: p.name, avatar: p.avatar, adult: p.birthday <= cutoff };
}
// 100,000 rounds is the most the Workers runtime allows for PBKDF2.
export async function passwordHash(password: string, salt: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key,
    256,
  );
  return hex(hash);
}
// Compares without stopping at the first difference.
export function sameHash(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

// Reads at most `limit` characters, so nobody can make the server buffer a huge body.
export async function readJson(
  req: Request,
  limit = 2500,
): Promise<Record<string, unknown> | 'tooLarge' | null> {
  const raw = await req.text();
  if (raw.length > limit) return 'tooLarge';
  try {
    const value = JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}
// Browsers send Origin on cross-site requests. A page on another site must not act as the player.
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export const minute = 60_000;
type Limit = { count: number; resetAt: number };
// Counts one attempt for `key` and says whether it is still within `limit` per `windowMs`.
export async function hit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN reset_at <= ? THEN 1 ELSE count + 1 END,
       reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END
     RETURNING count, reset_at`,
  )
    .bind(key, now + windowMs, now, now, now + windowMs)
    .first<Limit>();
  return {
    allowed: !!row && row.count <= limit,
    retryAfter: Math.ceil(((row?.resetAt ?? now) - now) / 1000),
  };
}
// Whether `key` already used up `limit` attempts, without counting a new one.
export async function exhausted(key: string, limit: number) {
  const now = Date.now();
  const row = await env.DB.prepare(
    'SELECT count, reset_at AS resetAt FROM rate_limits WHERE key=? AND reset_at>?',
  )
    .bind(key, now)
    .first<Limit>();
  return row && row.count >= limit ? Math.ceil((row.resetAt - now) / 1000) : 0;
}
export const forget = (key: string) => env.DB.prepare('DELETE FROM rate_limits WHERE key=?').bind(key).run();
// Where the request came from. Cloudflare sets this header, so a caller cannot choose it in production.
export const client = (req: Request) => req.headers.get('cf-connecting-ip') || 'local';
