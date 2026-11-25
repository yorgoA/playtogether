import type { QuizPower, QuizType, QuizView } from '../contract/rooms';
import { crossOutAt, introMs, powerMs, quizPowers, quizTypes, revealMs, suspenseMs } from '../quiz/rules';
import { GameError } from './games';
import { maxTiebreaks, totalRounds } from './rounds';
import { ownQuestions, type Question } from './trivia';

export type QuizRound = { theme: string; type: QuizType; text: string; options: string[]; correct: number };
type Play = { from: string; power: QuizPower; to: string | null; bounced: boolean };
export type Quiz = {
  stage: 'intro' | 'power' | 'question' | 'suspense' | 'reveal';
  rounds: QuizRound[];
  // Powers each player still has. Each can be used once in a match.
  hands: Record<string, QuizPower[]>;
  // This round's choices; null saves them all for later.
  chosen: Record<string, { power: QuizPower | null; target?: string }>;
  plays: Play[];
  smoked: Record<string, number[]>;
  removed: Record<string, number[]>;
  rushed: string[];
  cost: Record<string, number>;
  picks: Record<string, { value: number; at: number }>;
  // Wrong answers the TV crosses out during the suspense, in order.
  crossed: number[];
};
type Seat = { id: string; score: number; gained?: number; answered: boolean };
// The parts of a room a quiz works with.
export type QuizRoom = {
  quiz?: Quiz;
  players: Seat[];
  round: number;
  rounds: number;
  tiebreaks?: number;
  started: number;
  deadline: number;
  revealing?: boolean;
  asked?: string[];
};

function shuffle<T>(list: readonly T[]): T[] {
  const left = [...list];
  return Array.from(
    { length: left.length },
    () => left.splice(Math.floor(Math.random() * left.length), 1)[0],
  );
}

// Three powers in a match of five rounds, four in seven, five in ten. Everyone gets the same ones.
export function dealPowers(rounds: number, players: number): QuizPower[] {
  const extras = shuffle<QuizPower>(['thief', 'rush', 'mirror', 'copycat']);
  const kit: QuizPower[] = [
    'smoke',
    'half',
    'wager',
    ...extras.slice(0, rounds >= 10 ? 2 : rounds >= 7 ? 1 : 0),
  ];
  // Alone, there is nobody to aim at or be hit by.
  return players > 1 ? kit : kit.filter((p) => !quizPowers[p].target && p !== 'mirror');
}

function dealRounds(count: number, supply: Question[], asked: string[]): QuizRound[] {
  const seen = new Set(asked);
  const fresh = supply.filter((q) => !seen.has(q.text));
  const byTheme = new Map<string, Question[]>();
  for (const q of fresh.length >= count ? fresh : supply)
    byTheme.set(q.theme, [...(byTheme.get(q.theme) ?? []), q]);
  let themes: string[] = [];
  let types: QuizType[] = [];
  return Array.from({ length: count }, () => {
    if (!themes.length) themes = shuffle([...byTheme.keys()].filter((t) => byTheme.get(t)!.length));
    if (!types.length) types = shuffle(Object.keys(quizTypes) as QuizType[]);
    const theme = themes.pop()!;
    const list = byTheme.get(theme)!;
    const q = list.splice(Math.floor(Math.random() * list.length), 1)[0];
    const options = shuffle([q.right, ...q.wrong]);
    return { theme, type: types.pop()!, text: q.text, options, correct: options.indexOf(q.right) };
  });
}

export function startQuiz(r: QuizRoom, supply: Question[], now: number) {
  const pool = supply.length ? supply : ownQuestions;
  const asked = r.asked ?? [];
  const planned = dealRounds(r.rounds, pool, asked);
  r.asked = [...asked, ...planned.map((q) => q.text)].slice(-100);
  // Kept for tie-break rounds, and counted as asked only once played.
  const spare = dealRounds(Math.min(maxTiebreaks, pool.length), pool, r.asked);
  const kit = dealPowers(r.rounds, r.players.length);
  r.quiz = {
    stage: 'intro',
    rounds: [...planned, ...spare],
    hands: Object.fromEntries(r.players.map((p) => [p.id, [...kit]])),
    chosen: {},
    plays: [],
    smoked: {},
    removed: {},
    rushed: [],
    cost: {},
    picks: {},
    crossed: [],
  };
  r.round = 0;
  nextRound(r, now);
}

function enter(r: QuizRoom, stage: Quiz['stage'], now: number, ms: number) {
  r.quiz!.stage = stage;
  r.started = now;
  r.deadline = now + ms;
}
function nextRound(r: QuizRoom, now: number) {
  r.round++;
  if (r.round > r.rounds) r.asked = [...(r.asked ?? []), roundOf(r).text].slice(-100);
  r.revealing = false;
  Object.assign(r.quiz!, {
    chosen: {},
    plays: [],
    smoked: {},
    removed: {},
    rushed: [],
    cost: {},
    picks: {},
    crossed: [],
  });
  for (const p of r.players) {
    p.answered = false;
    p.gained = 0;
  }
  enter(r, 'intro', now, introMs);
}
const roundOf = (r: QuizRoom) => r.quiz!.rounds[r.round - 1];

function playPowers(r: QuizRoom) {
  const q = r.quiz!;
  const { correct } = roundOf(r);
  const here = (id?: string) => r.players.some((p) => p.id === id);
  for (const p of r.players) {
    const choice = q.chosen[p.id];
    if (!choice?.power) continue;
    const { power, target } = choice;
    const aimed = quizPowers[power].target;
    // The target left the room: the power stays in the hand.
    if (aimed && !here(target)) continue;
    q.hands[p.id] = q.hands[p.id].filter((held) => held !== power);
    const bounced = aimed && power !== 'copycat' && q.chosen[target!]?.power === 'mirror';
    q.plays.push({ from: p.id, power, to: aimed ? target! : null, bounced });
    const hit = bounced ? p.id : target!;
    if (power === 'smoke')
      q.smoked[hit] = [...new Set([...(q.smoked[hit] ?? []), ...shuffle([0, 1, 2, 3]).slice(0, 2)])];
    if (power === 'rush') q.rushed.push(hit);
    if (power === 'half') {
      q.removed[p.id] = shuffle([0, 1, 2, 3].filter((i) => i !== correct)).slice(0, 2);
      q.cost[p.id] = Math.max(100, Math.round(p.score * 0.2));
    }
  }
}
// When a player's time is up: earlier for those hit by Time Crunch.
function cutoff(r: QuizRoom, id: string) {
  const full = quizTypes[roundOf(r).type].ms;
  return r.started + (r.quiz!.rushed.includes(id) ? full / 2 : full);
}
// Skips the wait once everyone who is still here has acted.
export function hurryQuiz(r: QuizRoom, here: (p: Seat) => boolean, now: number) {
  const q = r.quiz!;
  const waiting = r.players.filter(here);
  if (!waiting.length) return;
  if (q.stage === 'power' && waiting.every((p) => q.chosen[p.id] || !q.hands[p.id]?.length))
    toQuestion(r, now);
  else if (q.stage === 'question' && waiting.every((p) => p.answered || now >= cutoff(r, p.id)))
    toSuspense(r, now);
}
function toQuestion(r: QuizRoom, now: number) {
  playPowers(r);
  enter(r, 'question', now, quizTypes[roundOf(r).type].ms);
}
function toSuspense(r: QuizRoom, now: number) {
  const q = r.quiz!;
  // Speed was measured from the start of the question, which `started` stops meaning now.
  for (const pick of Object.values(q.picks)) pick.at -= r.started;
  q.crossed = shuffle([0, 1, 2, 3].filter((i) => i !== roundOf(r).correct)).slice(0, crossOutAt.length);
  enter(r, 'suspense', now, suspenseMs);
}

function earnings(r: QuizRoom): Record<string, number> {
  const q = r.quiz!;
  const round = roundOf(r);
  const { ms } = quizTypes[round.type];
  const ids = r.players.map((p) => p.id);
  const right = (id: string) => q.picks[id]?.value === round.correct;
  const winners = ids.filter(right).length;
  const left = (id: string) => Math.max(0, 1 - q.picks[id].at / ms);
  const worth: Record<QuizType, (id: string) => number> = {
    accuracy: () => 1000,
    minefield: () => 1000,
    speed: (id) => 200 + Math.round(1000 * left(id)),
    balanced: (id) => 500 + Math.round(500 * left(id)),
    jackpot: () => Math.round((600 + 400 * ids.length) / winners),
  };
  const gains: Record<string, number> = {};
  for (const id of ids) {
    const allIn = q.plays.some((p) => p.from === id && p.power === 'wager');
    if (right(id)) gains[id] = worth[round.type](id) * (allIn ? 2 : 1);
    else if (allIn) gains[id] = -1000;
    else gains[id] = round.type === 'minefield' && q.picks[id] ? -500 : 0;
  }
  // Copies first, so the order people sit in never changes a score.
  const own = { ...gains };
  for (const { from, power, to } of q.plays)
    if (power === 'copycat' && ids.includes(from) && ids.includes(to!))
      gains[from] = Math.max(own[from], own[to!]);
  for (const { from, power, to, bounced } of q.plays) {
    if (!ids.includes(from) || (to && !ids.includes(to))) continue;
    if (power === 'half') gains[from] -= q.cost[from];
    if (power === 'thief') {
      const [thief, victim] = bounced ? [to!, from] : [from, to!];
      if (right(thief) && !right(victim)) {
        gains[thief] += 400;
        gains[victim] -= 400;
      }
    }
  }
  return gains;
}

// Moves on when time is up. Returns false when nothing happened, or 'over' after the last round.
export function advanceQuiz(r: QuizRoom, here: (p: Seat) => boolean, now: number): boolean | 'over' {
  const q = r.quiz!;
  if (now < r.deadline) {
    // Everyone still to answer may have run out of time under Time Crunch.
    const before = q.stage;
    if (before === 'question' && q.rushed.length) hurryQuiz(r, here, now);
    return q.stage !== before;
  }
  if (q.stage === 'intro') {
    if (r.players.some((p) => q.hands[p.id]?.length)) enter(r, 'power', now, powerMs);
    else toQuestion(r, now);
  } else if (q.stage === 'power') toQuestion(r, now);
  else if (q.stage === 'question') toSuspense(r, now);
  else if (q.stage === 'suspense') {
    const gains = earnings(r);
    for (const p of r.players) {
      p.gained = gains[p.id];
      p.score += gains[p.id];
    }
    r.revealing = true;
    enter(r, 'reveal', now, revealMs);
  } else if (r.round >= totalRounds(r)) return 'over';
  else nextRound(r, now);
  return true;
}

export function choosePower(r: QuizRoom, id: string, command: Record<string, unknown>) {
  const q = r.quiz!;
  if (q.stage !== 'power' || command.round !== r.round)
    throw new GameError('Powers are closed for this round.', 409);
  if (q.chosen[id]) return;
  const power = command.power as QuizPower | null;
  if (power === null) {
    q.chosen[id] = { power };
    return;
  }
  if (!q.hands[id]?.includes(power)) throw new GameError('You have already used that power.');
  const target = command.target as string | undefined;
  if (quizPowers[power].target && (target === id || !r.players.some((p) => p.id === target)))
    throw new GameError('Choose another player.');
  q.chosen[id] = { power, target: quizPowers[power].target ? target : undefined };
}

export function answerQuiz(r: QuizRoom, p: Seat, command: Record<string, unknown>, now: number) {
  const q = r.quiz!;
  if (q.stage !== 'question' || command.round !== r.round) throw new GameError('This round is closed.', 409);
  if (p.answered) return;
  const { value } = command;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 3)
    throw new GameError('Choose one answer.');
  if (now >= cutoff(r, p.id)) throw new GameError('Your time is up.', 409);
  if (q.removed[p.id]?.includes(value)) throw new GameError('That answer is gone.');
  q.picks[p.id] = { value, at: now };
  p.answered = true;
}

// The correct answer and everyone's picks go only to the TV, and only once revealed.
export function quizView(r: QuizRoom, viewer: string | undefined, host: boolean, clock: number) {
  const q = r.quiz!;
  const round = roundOf(r);
  const asking = q.stage === 'question';
  const reveal = q.stage === 'reveal';
  const conceal = (option: string, i: number) => {
    if (host) return asking ? '' : option;
    if (!viewer || !asking) return '';
    return q.smoked[viewer]?.includes(i) || q.removed[viewer]?.includes(i) ? '' : option;
  };
  const view: QuizView = {
    stage: q.stage,
    theme: round.theme,
    type: round.type,
    chosen: r.players.filter((p) => q.chosen[p.id] || !q.hands[p.id]?.length).map((p) => p.id),
    plays: q.plays,
    crossed:
      host && q.stage === 'suspense' ? q.crossed.filter((_, i) => clock - r.started >= crossOutAt[i]) : [],
    picks: host && reveal ? Object.fromEntries(Object.entries(q.picks).map(([id, p]) => [id, p.value])) : {},
  };
  if (viewer)
    view.mine = {
      powers: q.hands[viewer] ?? [],
      choice: q.chosen[viewer]?.power ?? null,
      smoked: asking ? (q.smoked[viewer] ?? []) : [],
      removed: asking ? (q.removed[viewer] ?? []) : [],
      until: asking ? cutoff(r, viewer) : r.deadline,
      right: reveal ? q.picks[viewer]?.value === round.correct : null,
      silent: reveal && !q.picks[viewer],
    };
  return {
    view,
    question:
      q.stage === 'intro' || q.stage === 'power'
        ? null
        : { text: round.text, options: round.options.map(conceal) },
    correct: host && reveal ? round.correct : null,
  };
}
