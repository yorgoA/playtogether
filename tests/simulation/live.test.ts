import { describe, expect, it, vi } from 'vitest';
import { links, openTable, type Link, type Phone } from './phone';
import { hostPyramid, playIsland, playKings, playPyramid, playQuiz, playRace, playReaction } from './players';
import { liveWorld } from './world';

// Real phones' behaviour against a running server, in real time (about four minutes):
//   PLAYTOGETHER_URL=http://localhost:5173 npm run test:live
const url = process.env.PLAYTOGETHER_URL;
vi.setConfig({ testTimeout: 15 * 60_000 });
const mix = (count: number): Link[] =>
  Array.from({ length: count }, (_, i) => [links.wifi, links.busy, links.slow][i % 3]);

describe.skipIf(!url).concurrent('live server', () => {
  async function match(
    game: string,
    phoneLinks: Link[],
    bots: number,
    play: (p: Phone) => Promise<unknown>,
    playHost: (host: Phone) => Promise<unknown> = async () => {},
  ) {
    const world = liveWorld(url!, 1);
    const t = await openTable(world, game, phoneLinks, 3);
    for (let i = 0; i < bots; i++) await t.host.keepTrying(() => t.host.request({ action: 'addBot' }));
    await t.start();
    await Promise.all([playHost(t.host), ...t.phones.map(play)]);
    await t.host.until(() => t.host.room?.phase === 'results', 10_000, 'results');
    await t.close();
    console.log(game, JSON.stringify(t.stats));
    expect(Object.keys(t.stats.statuses).filter((s) => Number(s) >= 500)).toEqual([]);
    expect(t.phones.every((p) => !p.expired)).toBe(true);
    return t;
  }
  it('12 quiz players', async () => {
    await match('quiz', mix(12), 0, (p) =>
      playQuiz(
        p,
        () => 1,
        () => 1500,
      ),
    );
  });
  it('8 reaction players', async () => {
    const t = await match('reaction', mix(8), 0, (p) => playReaction(p, () => 220));
    expect(t.phones.every((p) => p.me!.score > 0)).toBe(true);
  });
  it('4 racers', async () => {
    const t = await match('turbo', mix(4), 0, (p) => playRace(p));
    expect(t.host.room!.racers.every((c) => c.progress === 3)).toBe(true);
  });
  it('a full island', async () => {
    const t = await match('settlers', mix(2), 2, (p) => playIsland(p));
    expect(Math.max(...t.host.room!.players.map((p) => p.score))).toBeGreaterThanOrEqual(6);
  });
  it('8 Pyramid players', async () => {
    await match(
      'pyramid',
      mix(8),
      0,
      (p) => playPyramid(p),
      (host) => hostPyramid(host),
    );
  });
  it('8 Kings Cup players', async () => {
    const t = await match('kings', mix(8), 0, (p) => playKings(p));
    expect(t.host.room!.kings!.kings).toBe(4);
  });
});
