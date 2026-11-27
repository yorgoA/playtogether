import handler from 'vinext/server/fetch-handler';
import { stagingGate } from '../lib/server/staging-gate';
export { RoomObject } from '../lib/server/room-object';

const livePath = /^\/api\/rooms\/([A-Za-z2-9]{4})\/live$/;

const worker = {
  async fetch(req: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    // Static files are served before the Worker runs, so only pages and the API pass here, room sockets included.
    const blocked = await stagingGate(req, env.STAGING_PASSWORD);
    if (blocked) return blocked;
    // A room's WebSocket goes straight to its Durable Object, so the framework never touches the 101 response.
    const code = new URL(req.url).pathname.match(livePath)?.[1];
    if (code && env.ROOM_HOST === 'durable') return env.ROOMS.get(env.ROOMS.idFromName(code.toUpperCase())).fetch(req);
    return handler.fetch(req, env, ctx);
  },
};
export default worker;
