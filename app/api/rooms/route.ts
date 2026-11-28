import { create } from '@/lib/server/api';
import { limitCreate } from '@/lib/server/room-limits';
export const POST = (req: Request) => limitCreate(req, () => create(req));
