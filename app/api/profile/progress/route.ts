import { env } from 'cloudflare:workers';
import { gameIds, ProgressRequest } from '@/lib/contract';
import { current, readJson, reply, sameOrigin } from '@/lib/server/profiles';

// Only the signed-in profile's own achievements and favourites, read from its session.
async function progress(profileId: string) {
  const [earned, liked] = await Promise.all([
    env.DB.prepare(
      'SELECT achievement_id AS id, game, earned_at AS earnedAt FROM achievements WHERE profile_id=? ORDER BY earned_at, achievement_id',
    )
      .bind(profileId)
      .all<{ id: string; game: string; earnedAt: number }>(),
    env.DB.prepare('SELECT game FROM favourites WHERE profile_id=? ORDER BY game')
      .bind(profileId)
      .all<{ game: string }>(),
  ]);
  // A game removed since keeps its rows, but the screens are not shown it.
  const known = (game: string) => (gameIds as readonly string[]).includes(game);
  return reply({
    achievements: earned.results.filter((a) => known(a.game)),
    favourites: liked.results.map((f) => f.game).filter(known),
  });
}

export async function GET(req: Request) {
  const who = await current(req);
  if (!who) return reply({ error: 'Sign in first.' }, 401);
  return progress(who.id);
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply({ error: 'Request not allowed.' }, 403);
  if (req.headers.get('content-type')?.split(';')[0] !== 'application/json')
    return reply({ error: 'Send JSON.' }, 415);
  const data = await readJson(req);
  if (data === 'tooLarge') return reply({ error: 'Request too large.' }, 413);
  const checked = ProgressRequest.safeParse(data);
  if (!checked.success)
    return reply({ error: 'Choose a game to add to or remove from your favourites.' }, 400);
  const who = await current(req);
  if (!who) return reply({ error: 'Sign in first.' }, 401);
  const { game, favourite } = checked.data;
  await (
    favourite
      ? env.DB.prepare('INSERT OR IGNORE INTO favourites (profile_id, game) VALUES (?,?)').bind(who.id, game)
      : env.DB.prepare('DELETE FROM favourites WHERE profile_id=? AND game=?').bind(who.id, game)
  ).run();
  return progress(who.id);
}
