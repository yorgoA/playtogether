import handler from 'vinext/server/fetch-handler';
export { RoomObject } from '../lib/server/room-object';

const livePath = /^\/api\/rooms\/([A-Za-z2-9]{4})\/live$/;

const worker = {
  fetch(req: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    // A room's WebSocket goes straight to its Durable Object, so the framework never touches the 101 response.
    const code = new URL(req.url).pathname.match(livePath)?.[1];
    if (code && env.ROOM_HOST === 'durable') return env.ROOMS.get(env.ROOMS.idFromName(code.toUpperCase())).fetch(req);
    return handler.fetch(req, env, ctx);
  },
};
export default worker;
