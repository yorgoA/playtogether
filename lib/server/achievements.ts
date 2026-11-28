import { env } from 'cloudflare:workers';
import type { Game } from './games';
import type { Room } from './session';

// One achievement: earned by a signed-in player when a match of `game` ends, judged from the room as it ended.
export type Achievement = { id: string; game: Game; earned(r: Room, playerId: string): boolean };

// The list comes from #83. Until it is written, nobody earns anything.
export const achievements: Achievement[] = [];

// Saves what each signed-in seat earned in the match that just ended. Guests and bots earn nothing saved.
// An achievement already earned keeps its first date. A failure here never stops the game.
export async function award(r: Room, now: number) {
  if (!env.DB) return;
  try {
    const rows = achievements
      .filter((a) => a.game === r.game)
      .flatMap((a) =>
        r.players.filter((p) => p.profileId && !p.bot && a.earned(r, p.id)).map((p) => [p.profileId!, a.id]),
      );
    if (!rows.length) return;
    await env.DB.batch(
      rows.map(([profileId, achievementId]) =>
        env.DB.prepare(
          'INSERT OR IGNORE INTO achievements (profile_id, achievement_id, game, earned_at) VALUES (?,?,?,?)',
        ).bind(profileId, achievementId, r.game, now),
      ),
    );
  } catch (e) {
    console.error('Saving achievements failed', e instanceof Error ? e.message : 'unknown');
  }
}

// Whether a request just ended the match: the moment achievements are judged.
export const ended = (before: Room['phase'], r: Room) => before !== 'results' && r.phase === 'results';
