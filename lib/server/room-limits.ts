import { readText } from './body';
import { client, exhausted, hit, minute } from './profiles';

// Counted per address, and everyone on one Wi-Fi shares one: a household of 12 phones joining, coming back
// and retrying stays far below these.
const roomsPerHour = 30;
const joinsPerWindow = 60;
const unknownCodesPerWindow = 60;
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
// Screens already in a room send their token and only meet the join limit, so a guesser never blocks them.
export async function limitRoom(req: Request, handle: () => Promise<Response>) {
  const address = client(req);
  if (local(address)) return handle();
  const misses = 'rooms:unknown:' + address;
  if (!req.headers.get('authorization')) {
    const wait = await exhausted(misses, unknownCodesPerWindow);
    if (wait) return tooMany('wrong room codes', wait);
  }
  if (req.method === 'POST' && (await action(req)) === 'join') {
    const { allowed, retryAfter } = await hit('rooms:join:' + address, joinsPerWindow, window);
    if (!allowed) return tooMany('joins', retryAfter);
  }
  const res = await handle();
  if (res.status === 404) await hit(misses, unknownCodesPerWindow, window);
  return res;
}
