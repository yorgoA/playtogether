import { handle } from '@/lib/server/api';
import { limitRoom } from '@/lib/server/room-limits';
async function room(req: Request, ctx: { params: Promise<{ code: string }> }) {
  const code = (await ctx.params).code;
  return limitRoom(req, () => handle(req, code));
}
export const GET = room;
export const POST = room;
