import { readText } from './body';
import { client, exhausted, hit, minute } from './profiles';

// Counted per address, and everyone on one Wi-Fi shares one: a household of 12 phones joining, coming back
// and retrying stays far below these.
const roomsPerHour = 30;
const joinsPerWindow = 60;
const unknownCodesPerWindow = 60;
// Sockets opened, reconnections after a drop included.
const socketsPerWindow = 120;
const window = 10 * minute;

// On this machine there is no Cloudflare address, so local play and `npm run test:live` are never limited.
const local = (address: string) => ['local', '127.0.0.1', '::1'].includes(address);

const tooMany = (what: string, seconds: number) =>
  Response.json(
    { error: `Too many ${what} from this network. Try again in a few minutes.` },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, seconds)), 'Cache-Control': 'no-store' } },
  );

// POST /api/rooms: new rooms per address.
export async function limitCreate(req: Request, create: () => Promise<Response>) {
  const address = client(req);
  if (!local(address)) {
    const { allowed, retryAfter } = await hit('rooms:create:' + address, roomsPerHour, 60 * minute);
    if (!allowed) return tooMany('new rooms', retryAfter);
  }
  return create();
}

async function action(req: Request) {
  try {
    return (JSON.parse((await readText(req.clone() as Request)) ?? '') as { action?: unknown }).action;
  } catch {
    return undefined;
  }
}

// GET and POST /api/rooms/:code: joins per address, and codes that lead nowhere, so codes cannot be guessed.
// Once an address is blocked, a request with a token still goes through, but only a 200 comes back as it is:
// a wrong code and a made-up token both get the same 429, while screens already in a room keep playing.
export async function limitRoom(req: Request, handle: () => Promise<Response>) {
  const address = client(req);
  if (local(address)) return handle();
  const misses = 'rooms:unknown:' + address;
  const anonymous = !req.headers.get('authorization');
  if (anonymous) {
    const wait = await exhausted(misses, unknownCodesPerWindow);
    if (wait) return tooMany('wrong room codes', wait);
  }
  if (req.method === 'POST' && (await action(req)) === 'join') {
    const { allowed, retryAfter } = await hit('rooms:join:' + address, joinsPerWindow, window);
    if (!allowed) return tooMany('joins', retryAfter);
  }
  const res = await handle();
  // Polls that succeed cost no extra read.
  if (res.status === 200) return res;
  if (!anonymous) {
    const wait = await exhausted(misses, unknownCodesPerWindow);
    if (wait) return tooMany('wrong room codes', wait);
  }
  if (res.status === 404) await hit(misses, unknownCodesPerWindow, window);
  return res;
}

// GET /api/rooms/:code/live, the room's WebSocket. The token only comes in the first message, so an address
// that guessed codes gets no socket at all, and each address may open a few a minute: every attempt wakes a
// Durable Object, even for a code with no room. A screen without its socket goes back to polling.
export async function limitLive(req: Request, open: () => Promise<Response>) {
  const address = client(req);
  if (local(address)) return open();
  const wait = await exhausted('rooms:unknown:' + address, unknownCodesPerWindow);
  if (wait) return tooMany('wrong room codes', wait);
  const { allowed, retryAfter } = await hit('rooms:live:' + address, socketsPerWindow, window);
  if (!allowed) return tooMany('room connections', retryAfter);
  return open();
}
