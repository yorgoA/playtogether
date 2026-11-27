import type { Difficulty, DuelView } from '../contract/rooms';
import { contends, totalRounds } from './rounds';

// A standoff: everyone draws on the signal and the slowest falls, until one is left standing.
// `aims` holds each bot's plan for this draw: its reaction time, or `early` when it jumps the gun.
type Aim = { ms: number } | { early: true };
export type Duel = DuelView & { wasted: number; aims?: Record<string, Aim> };
type Seat = {
  bot?: boolean;
  difficulty?: Difficulty;
  id: string;
  score: number;
  answered: boolean;
  reactionMs?: number;
  early?: boolean;
  gained?: number;
};
export type DuelRoom = {
  duel?: Duel;
  players: Seat[];
  round: number;
  rounds: number;
  tiebreaks?: number;
  contenders?: string[];
  started: number;
  deadline: number;
  signalAt: number;
  revealing?: boolean;
};

// Fixed, so the deadline does not give the signal away. Longest wait is five seconds.
const drawMs = 9000;
const bangMs = 4500;
const roundOverMs = 6000;
// Draws in a row where nobody survives before the round is called off.
const wasteLimit = 3;

// A bot's reaction after the signal, in ms, and how often it jumps the gun.
const botReaction: Record<Difficulty, { from: number; to: number; early: number }> = {
  easy: { from: 420, to: 650, early: 0.1 },
  normal: { from: 290, to: 420, early: 0.03 },
  hard: { from: 210, to: 300, early: 0 },
};
// How long before the signal a bot that jumps the gun shoots.
const botJumpMs = 400;

// Rolled once, when the draw starts, so the plan is saved with the room and holds on every request.
function planBots(r: DuelRoom) {
  const d = r.duel!;
  for (const p of r.players) {
    if (!p.bot || !d.alive.includes(p.id)) continue;
    const { from, to, early } = botReaction[p.difficulty ?? 'normal'];
    d.aims![p.id] =
      Math.random() < early ? { early: true } : { ms: Math.round(from + Math.random() * (to - from)) };
  }
}

function newDraw(r: DuelRoom, now: number) {
  const d = r.duel!;
  // Never reused, so a shot that arrives late cannot count in the next draw.
  d.draw++;
  d.fallen = [];
  d.aims = {};
  r.revealing = false;
  r.started = now;
  r.deadline = now + drawMs;
  r.signalAt = now + 2000 + Math.floor(Math.random() * 3000);
  for (const p of r.players) {
    p.answered = false;
    p.reactionMs = undefined;
    p.early = undefined;
    p.gained = 0;
  }
  planBots(r);
}
// After a pause, with the shots already fired kept.
export function rearm(r: DuelRoom, now: number) {
  if (r.revealing) return;
  r.started = now;
  r.deadline = now + drawMs;
  r.signalAt = now + 2000 + Math.floor(Math.random() * 3000);
}
function newRound(r: DuelRoom, now: number) {
  r.round++;
  Object.assign(r.duel!, {
    alive: r.players.filter((p) => contends(r, p.id)).map((p) => p.id),
    winner: null,
    over: false,
    wasted: 0,
  });
  newDraw(r, now);
}
export function startDuel(r: DuelRoom, now: number) {
  r.duel = { alive: [], draw: 0, fallen: [], winner: null, over: false, wins: {}, wasted: 0 };
  r.round = 0;
  newRound(r, now);
}

function crown(r: DuelRoom) {
  const d = r.duel!;
  const winner = r.players.find((p) => p.id === d.alive[0]);
  if (d.over || d.alive.length !== 1 || !winner) return;
  d.over = true;
  d.winner = winner.id;
  d.wins[winner.id] = (d.wins[winner.id] ?? 0) + 1;
  winner.score += 500;
  winner.gained = (winner.gained ?? 0) + 500;
}
function bang(r: DuelRoom, now: number) {
  const d = r.duel!;
  const standing = r.players.filter((p) => d.alive.includes(p.id));
  const shots = standing.filter((p) => p.reactionMs !== undefined);
  // Jumping the gun or never drawing costs more than being slow.
  const foul = standing.filter((p) => p.reactionMs === undefined);
  const slowest = Math.max(...shots.map((p) => p.reactionMs!));
  let dead = foul.length ? foul : shots.filter((p) => p.reactionMs === slowest);
  if (dead.length === standing.length) dead = [];
  const survivors = standing.filter((p) => !dead.includes(p));
  const fastest = [...shots].sort((a, b) => a.reactionMs! - b.reactionMs!)[0];
  d.fallen = dead.map((p) => ({
    id: p.id,
    by: fastest && fastest !== p ? fastest.id : null,
    why: p.early ? 'early' : p.reactionMs === undefined ? 'silent' : 'slow',
  }));
  d.alive = survivors.map((p) => p.id);
  d.wasted = dead.length ? 0 : d.wasted + 1;
  if (dead.length)
    for (const p of survivors) {
      p.gained = 100;
      p.score += 100;
    }
  crown(r);
  if (d.wasted >= wasteLimit) d.over = true;
  r.revealing = true;
  r.deadline = now + (d.over ? roundOverMs : bangMs);
}
export function bangWhenAllShot(r: DuelRoom, now: number) {
  const { alive } = r.duel!;
  if (!r.revealing && r.players.every((p) => p.answered || !alive.includes(p.id))) bang(r, now);
}
// Returns false when nothing happened, or 'over' after the last round.
export function advanceDuel(r: DuelRoom, now: number): boolean | 'over' {
  if (now < r.deadline) return false;
  if (!r.revealing) bang(r, now);
  else if (!r.duel!.over) newDraw(r, now);
  else if (r.round >= totalRounds(r)) return 'over';
  else newRound(r, now);
  return true;
}
// A removed player leaves the standoff. Fewer than two players end the match elsewhere.
export function leaveDuel(r: DuelRoom, id: string, now: number) {
  const d = r.duel!;
  d.alive = d.alive.filter((other) => other !== id);
  d.fallen = d.fallen.filter((f) => f.id !== id).map((f) => (f.by === id ? { ...f, by: null } : f));
  if (d.over) return;
  if (d.alive.length > 1) {
    bangWhenAllShot(r, now);
    return;
  }
  crown(r);
  d.over = true;
  r.revealing = true;
  r.deadline = now + roundOverMs;
}
export function duelView({ alive, draw, fallen, winner, over, wins }: Duel): DuelView {
  return { alive, draw, fallen, winner, over, wins };
}

// Shoots for the bots whose moment has come. Returns whether one shot.
export function duelBots(r: DuelRoom, bots: Record<string, Difficulty>, now: number) {
  const d = r.duel!;
  if (r.revealing) return false;
  let acted = false;
  for (const p of r.players) {
    const level = bots[p.id];
    if (!level || p.answered || !d.alive.includes(p.id)) continue;
    const aim = d.aims?.[p.id];
    if (!aim || now < r.signalAt + ('early' in aim ? -botJumpMs : aim.ms)) continue;
    if ('early' in aim) p.early = true;
    else p.reactionMs = aim.ms;
    p.answered = true;
    acted = true;
  }
  return acted;
}
