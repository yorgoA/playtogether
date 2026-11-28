import handler from 'vinext/server/fetch-handler';
import { limitLive } from '../lib/server/room-limits';
import { withSecurityHeaders } from '../lib/server/security-headers';
import { stagingGate } from '../lib/server/staging-gate';
export { RoomObject } from '../lib/server/room-object';

const livePath = /^\/api\/rooms\/([A-Za-z2-9]{4})\/live$/;

const worker = {
  async fetch(req: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    // Static files are served before the Worker runs, so only pages and the API pass here, room sockets included.
    const code = new URL(req.url).pathname.match(livePath)?.[1];
    const res =
      (await stagingGate(req, env.STAGING_PASSWORD)) ??
      // A room's WebSocket goes straight to its Durable Object, so the framework never touches the 101 response.
      (code && env.ROOM_HOST === 'durable'
        ? await limitLive(req, () => env.ROOMS.get(env.ROOMS.idFromName(code.toUpperCase())).fetch(req))
        : await handler.fetch(req, env, ctx));
    return withSecurityHeaders(res, new URL(req.url).protocol === 'https:');
  },
};
export default worker;
