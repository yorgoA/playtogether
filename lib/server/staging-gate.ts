// Staging only: when the Worker has a STAGING_PASSWORD secret, every page and API call needs it first.
// A cookie carries the proof, not the Authorization header, which the API already uses for room tokens.
// Production and local development have no such secret, so nothing changes there.

export const gatePath = '/__staging';
const cookie = 'pt_staging';
const cookieSeconds = 30 * 24 * 60 * 60;
const enc = new TextEncoder();

// The cookie holds a keyed hash of the password, so changing the password signs everyone out.
async function proof(password: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode('playtogether-staging-v1')));
  return [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Compares in constant time, so the response time says nothing about how much of a guess was right.
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function cookieValue(req: Request) {
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === cookie) return value.join('=');
  }
  return '';
}

// Only a path on this site, so the form cannot send someone elsewhere after signing in.
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
}

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const noStore = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' };

function page(next: string, wrong: boolean, status: number) {
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>PlayTogether staging</title>
<style>
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#111214;color:#f4f4f5;font:16px/1.5 system-ui,sans-serif}
form{width:min(320px,calc(100vw - 32px));display:grid;gap:12px}
h1{margin:0;font-size:20px}
p{margin:0;color:#a1a1aa}
input,button{font:inherit;padding:12px;border-radius:10px;border:1px solid #3f3f46}
input{background:#1c1d21;color:inherit}
button{background:#c6f36b;color:#111214;border:0;font-weight:600}
.wrong{color:#fca5a5}
</style>
</head>
<body>
<form method="post" action="${gatePath}">
<h1>PlayTogether staging</h1>
<p>This test copy is private. Enter the staging password.</p>
${wrong ? '<p class="wrong">Wrong password.</p>' : ''}
<input type="password" name="password" autocomplete="current-password" required autofocus aria-label="Password">
<input type="hidden" name="next" value="${escape(next)}">
<button type="submit">Continue</button>
</form>
</body>
</html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', ...noStore } });
}

// Returns the response to send instead of the game, or null when the request may go through.
export async function stagingGate(req: Request, password: string | undefined): Promise<Response | null> {
  if (!password) return null;
  const url = new URL(req.url);
  const expected = await proof(password);

  if (url.pathname === gatePath) {
    if (req.method !== 'POST') return page(safeNext(url.searchParams.get('next')), false, 200);
    const form = await req.formData().catch(() => null);
    const given = form?.get('password');
    const next = safeNext(typeof form?.get('next') === 'string' ? (form.get('next') as string) : null);
    if (typeof given !== 'string' || !same(await proof(given), expected)) return page(next, true, 401);
    const secure = url.protocol === 'https:' ? '; Secure' : '';
    return new Response(null, {
      status: 303,
      headers: {
        Location: next,
        'Set-Cookie': `${cookie}=${expected}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${cookieSeconds}${secure}`,
        ...noStore,
      },
    });
  }

  if (same(cookieValue(req), expected)) return null;
  if (url.pathname.startsWith('/api/'))
    return Response.json(
      { error: 'This staging copy needs its password first.' },
      { status: 401, headers: noStore },
    );
  if (req.method !== 'GET' && req.method !== 'HEAD')
    return new Response(null, { status: 401, headers: noStore });
  return new Response(null, {
    status: 302,
    headers: { Location: `${gatePath}?next=${encodeURIComponent(url.pathname + url.search)}`, ...noStore },
  });
}
