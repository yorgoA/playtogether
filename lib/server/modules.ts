import { matchOf, type AnyModule, type MatchRoom } from './engine';
import { stormModule } from './storm';

// Games that run on the shared engine. The other games are still wired by hand in session.ts.
export const modules: AnyModule[] = [stormModule];

export const moduleForGame = (game: string) => modules.find((m) => m.game === game);
export const moduleForAction = (action: unknown) => modules.find((m) => m.action === action);
// The game whose match this room holds, if it runs on the engine.
export const activeModule = (r: MatchRoom) => modules.find((m) => matchOf(m, r) !== undefined);
