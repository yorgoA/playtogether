import type { Difficulty } from '../contract';
import { GameError, games, type Game } from './games';

type Command = Record<string, unknown>;

// What the engine knows when it asks a game to act.
export type MatchContext = {
  now: number;
  // Players whose phones are still in touch, for games that wait on the whole table.
  connected: string[];
  // The bots at the table, and how well each one plays.
  bots: Record<string, Difficulty>;
};
// How long a bot waits into its turn, so the table can follow what it plays.
export const botDelayMs = 1500;

// What a game gives the engine. The engine runs the match around it: starting it, the turn clock, players
// leaving, the end and the final scores. A game only knows its own rules and what each screen may see.
export type GameModule<S, V> = {
  game: Game;
  // The command phones send to play, such as { action: 'storm', … }.
  action: string;
  // The room field that stores the match and the snapshot field that shows it.
  key: string;
  // How long a turn lasts before the engine calls `timeout`. Games without a turn clock leave it out.
  turnMs?: number;
  start(players: string[], ctx: MatchContext): S;
  move(state: S, playerId: string, command: Command, ctx: MatchContext): void;
  // Plays for the player who ran out of time.
  timeout?(state: S, ctx: MatchContext): void;
  // Whose turn it is, for games played in turns.
  turn?(state: S): string | null;
  // A bot's next command when it holds the turn. It sends it like a phone would, through `move`.
  bot?(state: S, playerId: string, level: Difficulty): Command;
  leave(state: S, playerId: string, ctx: MatchContext): void;
  over(state: S): boolean;
  score(state: S, playerId: string): number;
  // Hidden cards stay hidden: a player sees their own, the host screen sees none.
  view(state: S, viewer: { id?: string; host: boolean }): V;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyModule = GameModule<any, unknown>;

// The parts of a room the engine reads and writes. The match itself sits under the module's `key`.
export type MatchRoom = {
  phase: 'lobby' | 'playing' | 'paused' | 'results' | 'ended';
  deadline: number;
  players: { id: string; score: number }[];
};

const slot = (r: MatchRoom) => r as unknown as Record<string, unknown>;
export const matchOf = <S, V>(m: GameModule<S, V>, r: MatchRoom) => slot(r)[m.key] as S | undefined;

export function startMatch<S, V>(m: GameModule<S, V>, r: MatchRoom, ctx: MatchContext) {
  slot(r)[m.key] = m.start(
    r.players.map((p) => p.id),
    ctx,
  );
  r.deadline = m.turnMs ? ctx.now + m.turnMs : 0;
}

// Every accepted move restarts the turn clock.
export function playMatch<S, V>(
  m: GameModule<S, V>,
  r: MatchRoom,
  playerId: string,
  command: Command,
  ctx: MatchContext,
) {
  const state = matchOf(m, r);
  if (!state || r.phase !== 'playing') throw new GameError(games[m.game].name + ' is not active.', 409);
  m.move(state, playerId, command, ctx);
  settle(m, r, state, ctx.now, true);
}

// Plays one move for a bot whose turn it is, or for whoever ran out of time. Returns whether the match changed.
export function tickMatch<S, V>(m: GameModule<S, V>, r: MatchRoom, ctx: MatchContext) {
  const state = matchOf(m, r);
  if (!state || r.phase !== 'playing') return false;
  const turn = m.turn?.(state);
  const level = turn ? ctx.bots[turn] : undefined;
  const started = m.turnMs ? r.deadline - m.turnMs : ctx.now;
  if (turn && level && m.bot && ctx.now >= started + botDelayMs) {
    try {
      m.move(state, turn, m.bot(state, turn, level), ctx);
    } catch {
      // Every request runs this first, so a bot's bad move must not jam the room. It plays as if out of time.
      if (!m.timeout) return false;
      m.timeout(state, ctx);
    }
    settle(m, r, state, ctx.now, true);
    return true;
  }
  if (!m.turnMs || !m.timeout || ctx.now < r.deadline) return false;
  m.timeout(state, ctx);
  settle(m, r, state, ctx.now, true);
  return true;
}

// The clock restarts only when the player who left had the turn. While paused, `ctx.now` is the pause, and
// resuming moves the deadline on.
export function leaveMatch<S, V>(m: GameModule<S, V>, r: MatchRoom, playerId: string, ctx: MatchContext) {
  const state = matchOf(m, r);
  if (!state) return;
  const theirs = m.turn?.(state) === playerId;
  m.leave(state, playerId, ctx);
  settle(m, r, state, ctx.now, theirs);
}

// Back to the lobby: the match is gone.
export function clearMatch<S, V>(m: GameModule<S, V>, r: MatchRoom) {
  delete slot(r)[m.key];
}

export function viewMatch<S, V>(m: GameModule<S, V>, r: MatchRoom, viewer: { id?: string; host: boolean }) {
  const state = matchOf(m, r);
  return state === undefined ? undefined : m.view(state, viewer);
}

function settle<S, V>(m: GameModule<S, V>, r: MatchRoom, state: S, now: number, restart: boolean) {
  if (restart && m.turnMs) r.deadline = now + m.turnMs;
  if (!m.over(state)) return;
  r.phase = 'results';
  r.deadline = 0;
  for (const p of r.players) p.score = m.score(state, p.id);
}
