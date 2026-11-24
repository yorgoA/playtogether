import { handle } from '@/lib/server/api';
async function room(req: Request, ctx: { params: Promise<{ code: string }> }) {
  return handle(req, (await ctx.params).code);
}
export const GET = room;
export const POST = room;
