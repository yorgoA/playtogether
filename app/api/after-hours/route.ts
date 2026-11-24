import { adultGames } from '@/lib/contract';
import { current, publicProfile, reply } from '@/lib/server/profiles';
export async function GET(req: Request) {
  if (!publicProfile(await current(req))?.adult)
    return reply({ error: 'An adult profile is required.' }, 403);
  return reply({ games: adultGames });
}
