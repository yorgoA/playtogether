import { advanceDuel, bangWhenAllShot, duelView, leaveDuel, rearm, startDuel, type Duel } from './duel';
import { roundChoices } from '../quiz/rounds';
import { GameError, games, type Game } from './games';
import { advanceQuiz, answerQuiz, choosePower, hurryQuiz, quizView, startQuiz, type Quiz } from './quiz';
import type { Question } from './trivia';
import { gameIds, type Difficulty, type RoomSnapshot } from '../contract';
import { claimPyramid, flipPyramid, newPyramid, pyramidView, resolvePyramid, type Pyramid } from './pyramid';
import {
  kingsMove,
  kingsOver,
  kingsView,
  leaveKings,
  newKings,
  nextKings,
  resumeKings,
  settleRace,
  type Kings,
} from './kings';
import { stormModule, type Storm } from './storm';
import {
  clearMatch,
  leaveMatch,
  playMatch,
  startMatch,
  tickMatch,
  viewMatch,
  type MatchContext,
} from './engine';
import { activeModule, moduleForAction, moduleForGame, modules } from './modules';
import { addTiebreak, totalRounds } from './rounds';
import { bankLeft, islandMove, startIsland, totalPoints } from './island';
import { active, goal, handSize, pointsFor, resources, type Island } from '../island/board';
import { botMove } from './island-bot';
type Player = {
  bot?: boolean;
  difficulty?: Difficulty;
  // What the phone called its join, so repeating it gives back this seat. As secret as the token.
  joinId?: string;
  // A bot is playing this disconnected player's seat until they return.
  standIn?: boolean;
  id: string;
  token: string;
  name: string;
  avatar: string;
  color: string;
  reactionMs?: number;
  early?: boolean;
  gained?: number;
  ready: boolean;
  lastSeen: number;
  score: number;
  answered: boolean;
};
export type Room = {
  code: string;
  hostToken: string;
  game: Game;
  phase: 'lobby' | 'playing' | 'paused' | 'results' | 'ended';
  players: Player[];
  rounds: number;
  round: number;
  tiebreaks?: number;
  // Set when the first tie-break starts: the players tied for first, then those still level.
  contenders?: string[];
  quiz?: Quiz;
  duel?: Duel;
  cheers?: { n: number; from: string; emoji: string; at: number }[];
  // Quiz questions this room has had, so a rematch brings new ones.
  asked?: string[];
  botAt?: number;
  island?: Island;
  pyramid?: Pyramid;
  kings?: Kings;
  storm?: Storm;
  revealing?: boolean;
  started: number;
  deadline: number;
  signalAt: number;
  pausedAt: number;
};
type Command = Record<string, unknown>;
const connected = (p: Player, now: number) => !!p.bot || now - p.lastSeen < 25000;
const context = (r: Room, now: number): MatchContext => ({
  now,
  connected: r.players.filter((p) => connected(p, now)).map((p) => p.id),
  bots: Object.fromEntries(r.players.filter((p) => p.bot).map((p) => [p.id, p.difficulty ?? 'normal'])),
});
// Phones learn the signal before it fires, so every screen can show it together. Long enough for a slow
// phone to lose a message and ask again, and shorter than the shortest wait (2 s).
const signalLeadMs = 1800;
// How long a reaction stays on the TV, and how often one phone can send one.
const cheerMs = 4000;
const cheerGapMs = 700;
// Nobody reacts faster than this, so a quicker tap was a guess.
const fastestReactionMs = 80;
// Most of a late tap's delay we accept as network time: enough to lose a message twice on a slow phone.
const networkAllowanceMs = 3000;
function gameId(value: unknown): Game {
  const game = gameIds.find((id) => id === value);
  if (game) return game;
  throw new GameError('Choose an available game.');
}
function roundCount(game: Game, value: unknown) {
  const choices = roundChoices[game];
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10)
    if (!choices || choices.includes(value)) return value;
  throw new GameError(
    choices ? 'Choose ' + choices.join(', ') + ' rounds.' : 'Choose between 1 and 10 rounds.',
  );
}
export function newRoom(code: string, body: Command): Room {
  const game = gameId(body.game ?? 'quiz');
  return {
    code,
    hostToken: crypto.randomUUID(),
    game,
    phase: 'lobby',
    players: [],
    rounds: roundCount(game, body.rounds ?? roundChoices[game]?.[0] ?? 1),
    round: 0,
    started: 0,
    deadline: 0,
    signalAt: 0,
    pausedAt: 0,
  };
}
function playIsland(r: Room, p: Player, command: Command, now: number) {
  const board = r.island!;
  islandMove(board, p.id, p.name, command);
  // One move can change several scores, such as taking the longest road from someone.
  for (const player of r.players) player.score = pointsFor(board, player.id);
  if (totalPoints(board, active(board)) >= goal) {
    r.phase = 'results';
    for (const player of r.players) player.score = totalPoints(board, player.id);
  }
  r.botAt = now + 1150;
}
function advanceBots(r: Room, now: number) {
  const board = r.island;
  if (!board || r.phase !== 'playing' || now < (r.botAt ?? 0)) return false;
  for (const p of r.players) {
    if (!p.bot && !p.standIn) continue;
    const move = botMove(board, p.id);
    if (move) {
      playIsland(r, p, { ...move, revision: board.revision }, now);
      return true;
    }
  }
  return false;
}
function drink(r: Room, poured: ReturnType<typeof kingsMove>) {
  for (const p of r.players) if (poured?.drinkers.includes(p.id)) p.score -= poured.amount;
}
function advance(r: Room, now: number) {
  const engine = activeModule(r);
  if (engine) return tickMatch(engine, r, context(r, now));
  if (r.phase === 'playing' && r.kings) {
    const poured = settleRace(r.kings, now);
    drink(r, poured);
    return !!poured;
  }
  if (r.phase !== 'playing') return false;
  const moved = r.quiz
    ? advanceQuiz(r, (p) => connected(p as Player, now), now)
    : r.duel
      ? advanceDuel(r, now)
      : false;
  if (moved === 'over') {
    // A quiz needs a spare question for the extra round. Rooms from before tie-breaks have none.
    if (addTiebreak(r, !r.quiz || !!r.quiz.rounds[r.round])) return advance(r, now);
    r.phase = 'results';
    r.deadline = 0;
    return true;
  }
  return moved;
}
function lobby(r: Room) {
  r.revealing = false;
  r.phase = 'lobby';
  r.round = 0;
  delete r.tiebreaks;
  delete r.contenders;
  r.deadline = 0;
  r.signalAt = 0;
  delete r.quiz;
  delete r.duel;
  delete r.island;
  delete r.pyramid;
  delete r.kings;
  for (const m of modules) clearMatch(m, r);
  r.players.forEach((p) => {
    p.answered = false;
    p.reactionMs = undefined;
    p.early = undefined;
    p.gained = 0;
    p.score = 0;
  });
}
function clearStandIns(r: Room) {
  r.players.forEach((p) => {
    p.standIn = undefined;
  });
}
function reactionTime(command: Command, now: number, signal: number): number | null {
  const elapsed = now - signal;
  if (command.early === true || elapsed < 0) return null;
  const reported = command.reactionMs;
  if (typeof reported !== 'number' || !Number.isFinite(reported)) throw new GameError('Invalid reaction.');
  const ms = Math.round(Math.max(reported, elapsed - networkAllowanceMs));
  return ms < fastestReactionMs ? null : ms;
}
function removePlayer(r: Room, p: Player, now: number) {
  r.players = r.players.filter((other) => p !== other);
  if (r.phase !== 'playing' && r.phase !== 'paused') return;
  if (!r.players.length) {
    lobby(r);
    return;
  }
  if (r.contenders) {
    r.contenders = r.contenders.filter((id) => id !== p.id);
    // The last contender standing wins at once.
    if (r.contenders.length < 2) {
      r.phase = 'results';
      r.deadline = 0;
      return;
    }
  }
  if (r.pyramid) {
    const claim = r.pyramid.claim;
    if (claim && (claim.from === p.id || claim.to === p.id)) r.pyramid.claim = null;
    if (r.players.length < 2) r.phase = 'results';
    return;
  }
  if (r.kings) {
    leaveKings(r.kings, p.id);
    if (r.players.length < 2 || kingsOver(r.kings)) r.phase = 'results';
    return;
  }
  // While paused, the deadline moves forward on resume.
  const at = r.phase === 'paused' ? r.pausedAt : now;
  const engine = activeModule(r);
  if (engine) {
    leaveMatch(engine, r, p.id, context(r, at));
    return;
  }
  if (r.duel) {
    leaveDuel(r, p.id, at);
    if (r.players.length < 2) r.phase = 'results';
  } else if (r.quiz) hurryQuiz(r, (other) => connected(other as Player, at), at);
}
function start(r: Room, now: number, questions: Question[]) {
  const { name, minPlayers, maxPlayers } = games[r.game];
  if (r.players.length < minPlayers)
    throw new GameError(name + ' needs two to ' + (maxPlayers === 4 ? 'four' : 'eight') + ' players.');
  if (!r.players.some((p) => !p.bot && !p.standIn)) throw new GameError('Join with a phone before starting.');
  if (r.players.some((p) => !p.ready || !(p.standIn || connected(p, now))))
    throw new GameError('Every player must be connected and ready.');
  lobby(r);
  r.phase = 'playing';
  const engine = moduleForGame(r.game);
  if (engine) {
    startMatch(engine, r, context(r, now));
    return;
  }
  if (r.game === 'pyramid') {
    r.pyramid = newPyramid(r.players.map((p) => p.id));
    return;
  }
  if (r.game === 'kings') {
    r.kings = newKings(r.players.map((p) => p.id));
    return;
  }
  if (r.game === 'quiz') startQuiz(r, questions, now);
  if (r.game === 'reaction') startDuel(r, now);
  if (r.game === 'settlers') {
    const used = new Set<string>();
    for (const p of r.players) {
      if (used.has(p.color.toLowerCase()))
        p.color = ['#bc96ff', '#ffae65', '#69dafa', '#c3f76a'].find((c) => !used.has(c))!;
      used.add(p.color.toLowerCase());
    }
    r.botAt = now + 1150;
    r.island = startIsland(r.players.map((p) => p.id));
  }
}
function textField(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new GameError('Choose a valid ' + label + '.');
  return value.trim();
}
// `questions` are what a quiz starting now can ask.
export function mutate(r: Room, command: Command, token: string, now: number, questions: Question[] = []) {
  const { action } = command;
  let dirty = advance(r, now);
  const extras: Record<string, string> = {};
  if (action === 'join') {
    const joinId = typeof command.joinId === 'string' ? command.joinId : undefined;
    const again = joinId ? r.players.find((p) => p.joinId === joinId) : undefined;
    if (again && r.phase !== 'ended') {
      // The same phone repeating a join. Both replies carry the same token, so either one works.
      again.lastSeen = now;
      again.standIn = undefined;
      return { dirty: true, extras: { playerId: again.id, playerToken: again.token } };
    }
    const wanted = typeof command.name === 'string' ? command.name.trim().toLowerCase() : '';
    const dropped = r.players.find((p) => p.name.toLowerCase() === wanted && !connected(p, now));
    if (dropped && r.phase !== 'ended') {
      // A fresh token moves the seat to this phone; the old one stops working.
      dropped.token = crypto.randomUUID();
      dropped.joinId = joinId;
      dropped.lastSeen = now;
      dropped.standIn = undefined;
      return { dirty: true, extras: { playerId: dropped.id, playerToken: dropped.token } };
    }
    if (r.phase !== 'lobby') throw new GameError('This room is no longer accepting players.', 409);
    if (r.players.length >= games[r.game].maxPlayers) throw new GameError('This room is full.', 409);
    const name = textField(command.name, 20, 'nickname');
    if (r.players.some((p) => p.name.toLowerCase() === name.toLowerCase()))
      throw new GameError('That nickname is already in the room.');
    const avatar = textField(command.avatar ?? '🎮', 32, 'avatar');
    const color = command.color ?? '#A783FF';
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))
      throw new GameError('Choose a player color.');
    const id = crypto.randomUUID(),
      playerToken = crypto.randomUUID();
    r.players.push({
      id,
      token: playerToken,
      joinId,
      name,
      avatar,
      color,
      ready: false,
      lastSeen: now,
      score: 0,
      answered: false,
    });
    return { dirty: true, extras: { playerId: id, playerToken } };
  }
  const host = !!token && token === r.hostToken;
  const player = r.players.find((p) => p.token === token);
  if (!host && !player) throw new GameError('Join this room first.', 403);
  if (player && now - player.lastSeen >= 6500) {
    player.lastSeen = now;
    dirty = true;
  }
  if (player?.standIn) {
    player.standIn = undefined;
    dirty = true;
  }
  if (action === 'view') return { dirty: advanceBots(r, now) || dirty, extras };
  if (r.phase === 'ended') throw new GameError('The host has ended this room.', 410);
  const engine = moduleForAction(action);
  if (action === 'cheer' && player) {
    const recent = (r.cheers ?? []).filter((c) => now - c.at < cheerMs);
    const moment =
      r.phase === 'results' ||
      (r.phase === 'playing' && (r.revealing || r.quiz?.stage === 'suspense') && (r.quiz || r.duel));
    if (!moment || recent.some((c) => c.from === player.id && now - c.at < cheerGapMs))
      return { dirty, extras };
    const n = Math.max(now, (r.cheers?.at(-1)?.n ?? 0) + 1);
    r.cheers = [...recent, { n, from: player.id, emoji: String(command.emoji), at: now }].slice(-20);
  } else if (action === 'ready' && player) {
    if (r.phase !== 'lobby' || typeof command.ready !== 'boolean')
      throw new GameError('Ready status can be set in the lobby.');
    player.ready = command.ready;
  } else if (action === 'island' && player) {
    if (!r.island || r.phase !== 'playing')
      throw new GameError(r.phase === 'paused' ? 'The game is paused.' : 'The match is not active.', 409);
    playIsland(r, player, command, now);
  } else if ((action === 'pyramidClaim' || action === 'pyramidReply') && player) {
    if (!r.pyramid || r.phase !== 'playing') throw new GameError('Pyramid is not active.', 409);
    if (action === 'pyramidClaim') {
      claimPyramid(
        r.pyramid,
        player.id,
        command.target,
        command.slot,
        command.index,
        r.players.filter((p) => connected(p, now)).map((p) => p.id),
      );
    } else {
      const outcome = resolvePyramid(r.pyramid, player.id, command.call === true, command.index);
      r.players.find((p) => p.id === outcome.loser)!.score -= outcome.points;
    }
  } else if (action === 'kings' && player) {
    if (!r.kings || r.phase !== 'playing') throw new GameError('Kings Cup is not active.', 409);
    const poured = kingsMove(
      r.kings,
      player.id,
      command,
      r.players.filter((p) => connected(p, now)).map((p) => p.id),
      now,
    );
    drink(r, poured);
    if (kingsOver(r.kings)) r.phase = 'results';
  } else if (engine && player) {
    playMatch(engine, r, player.id, command, context(r, now));
  } else if (action === 'input' && player) {
    if (r.game === 'storm') throw new GameError('Use the Storm Deck controls.');
    if (r.game === 'settlers') throw new GameError('Use the island controls.');
    if (r.game === 'pyramid') throw new GameError('Use the Pyramid controls.');
    if (r.game === 'kings') throw new GameError('Use the Kings Cup controls.');
    if (r.phase !== 'playing' || command.round !== r.round) throw new GameError('This round is closed.', 409);
    if (r.quiz) {
      answerQuiz(r, player, command, now);
      hurryQuiz(r, (p) => connected(p as Player, now), now);
    } else if (r.duel) {
      if (r.revealing || command.draw !== r.duel.draw) throw new GameError('This draw is over.', 409);
      if (!r.duel.alive.includes(player.id)) throw new GameError('You are out of this round.', 409);
      if (player.answered) return { dirty, extras };
      const ms = reactionTime(command, now, r.signalAt);
      if (ms === null) player.early = true;
      else player.reactionMs = ms;
      player.answered = true;
      bangWhenAllShot(r, now);
    }
  } else if (action === 'quizPower' && player) {
    if (!r.quiz || r.phase !== 'playing') throw new GameError('The quiz is not active.', 409);
    choosePower(r, player.id, command);
    hurryQuiz(r, (p) => connected(p as Player, now), now);
  } else if (host) {
    switch (action) {
      case 'addBot': {
        if (r.game !== 'settlers' || r.phase !== 'lobby')
          throw new GameError('Add bots in the Island Settlers lobby.');
        if (r.players.length >= 4 || r.players.filter((p) => p.bot).length >= 3)
          throw new GameError('No bot seat available.');
        let n = 1;
        while (r.players.some((p) => p.name.toLowerCase() === 'bot ' + n)) n++;
        r.players.push({
          id: crypto.randomUUID(),
          token: crypto.randomUUID(),
          bot: true,
          name: 'Bot ' + n,
          avatar: '🤖',
          color: ['#bc96ff', '#ffae65', '#69dafa', '#c3f76a'].find(
            (c) => !r.players.some((p) => p.color === c),
          )!,
          ready: true,
          lastSeen: now,
          score: 0,
          answered: false,
        });
        break;
      }
      case 'configure':
        if (r.phase !== 'lobby') throw new GameError('Return to the lobby first.');
        if (command.game !== undefined) {
          const game = gameId(command.game);
          if (r.players.length > games[game].maxPlayers)
            throw new GameError('This game supports fewer players than are in the room.');
          if (r.game !== game) {
            clearStandIns(r);
            r.players = r.players.filter((p) => !p.bot);
            r.players.forEach((p) => (p.ready = false));
          }
          r.game = game;
          const choices = roundChoices[game];
          if (choices && !choices.includes(r.rounds)) r.rounds = choices[0];
        }
        if (command.rounds !== undefined) r.rounds = roundCount(r.game, command.rounds);
        break;
      case 'start':
        if (r.phase !== 'lobby' && r.phase !== 'results')
          throw new GameError('A match is already in progress.');
        start(r, now, questions);
        break;
      case 'pyramidFlip':
        if (!r.pyramid || r.phase !== 'playing') throw new GameError('Pyramid is not active.', 409);
        if (flipPyramid(r.pyramid, command.index)) r.phase = 'results';
        break;
      case 'kingsNext':
        if (!r.kings || r.phase !== 'playing' || command.seq !== r.kings.seq)
          throw new GameError('The table has moved on.', 409);
        nextKings(r.kings);
        if (kingsOver(r.kings)) r.phase = 'results';
        break;
      case 'restart':
        start(r, now, questions);
        break;
      case 'pause':
        if (r.phase !== 'playing') throw new GameError('No active match to pause.');
        r.phase = 'paused';
        r.pausedAt = now;
        break;
      case 'resume': {
        if (r.phase !== 'paused') throw new GameError('This match is not paused.');
        const delta = now - r.pausedAt;
        r.started += delta;
        r.deadline += delta;
        if (r.signalAt) r.signalAt += delta;
        if (r.quiz)
          for (const pick of Object.values(r.quiz.picks)) if (r.quiz.stage === 'question') pick.at += delta;
        // A fresh signal keeps resuming from giving away the moment.
        if (r.duel) rearm(r, now);
        if (r.kings) resumeKings(r.kings, delta);
        r.phase = 'playing';
        break;
      }
      case 'lobby':
        lobby(r);
        clearStandIns(r);
        break;
      case 'end':
        r.phase = 'ended';
        break;
      case 'kick': {
        const p = r.players.find((p) => p.id === command.playerId);
        if (r.island && (r.phase === 'playing' || r.phase === 'paused'))
          throw new GameError('Let a bot take over this seat instead.');
        if (!p || (p.bot ? r.phase !== 'lobby' : connected(p, now)))
          throw new GameError('Only disconnected players can be removed.');
        removePlayer(r, p, now);
        break;
      }
      case 'standIn': {
        const p = r.players.find((p) => p.id === command.playerId);
        if (!r.island || (r.phase !== 'playing' && r.phase !== 'paused'))
          throw new GameError('Bots can take over during Island Settlers.');
        if (!p || p.bot || connected(p, now))
          throw new GameError('Only disconnected players can be replaced.');
        p.standIn = true;
        r.botAt = now + 1150;
        break;
      }
      default:
        throw new GameError('Unknown room action.');
    }
  } else throw new GameError('This action requires the host.', 403);
  return { dirty: true, extras };
}
export function snapshot(r: Room, now: number, token = ''): RoomSnapshot {
  const viewer = r.players.find((p) => p.token === token);
  const host = !!token && token === r.hostToken;
  const board = r.island;
  const island = board
    ? (({ hands, deck, dev, ...publicBoard }) => ({
        ...publicBoard,
        hand: viewer ? hands[viewer.id] : undefined,
        // An offer saved before offers could hold several cards.
        offer: typeof publicBoard.offer?.give === 'string' ? null : publicBoard.offer,
        bankEmpty: resources.filter((k) => !bankLeft(board)[k]),
        // How many cards everyone holds is public; which ones is not.
        handSizes: Object.fromEntries(Object.entries(hands).map(([id, hand]) => [id, handSize(hand)])),
        devHand: viewer && (dev?.[viewer.id] ?? []),
        devSizes: Object.fromEntries(Object.keys(hands).map((id) => [id, dev?.[id]?.length ?? 0])),
        deckLeft: deck?.length ?? 0,
      }))(board)
    : undefined;
  const clock = r.phase === 'paused' ? r.pausedAt : now;
  const signalAt = r.signalAt && clock >= r.signalAt - signalLeadMs ? r.signalAt : null;
  const quiz =
    r.quiz && (r.phase === 'playing' || r.phase === 'paused')
      ? quizView(r, viewer?.id, host, clock)
      : undefined;
  // Who shot when stays secret until the smoke clears.
  const shotsShown = !r.duel || !!r.revealing;
  return {
    island,
    pyramid: r.pyramid ? pyramidView(r.pyramid, viewer?.id) : undefined,
    kings: r.kings ? kingsView(r.kings) : undefined,
    storm: viewMatch(stormModule, r, { id: viewer?.id, host }),
    quiz: quiz?.view,
    duel: r.duel ? duelView(r.duel) : undefined,
    code: r.code,
    game: r.game,
    phase: r.phase,
    rounds: totalRounds(r),
    round: r.round,
    // Only tie-breaks take a match past the rounds chosen in the lobby, where the round is 0.
    tiebreak: r.round > r.rounds,
    contenders: r.contenders ?? [],
    deadline: r.deadline,
    signalAt,
    serverTime: now,
    pausedAt: r.pausedAt,
    revealing: Boolean(r.revealing),
    correct: quiz?.correct ?? null,
    question: quiz?.question ?? null,
    cheers: (r.cheers ?? [])
      .filter((c) => now - c.at < cheerMs)
      .map(({ n, from, emoji }) => ({ n, from, emoji })),
    players: r.players.map((p) => ({
      bot: p.bot,
      standIn: p.standIn,
      early: shotsShown || p === viewer ? p.early : undefined,
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      reactionMs: shotsShown || p === viewer ? p.reactionMs : undefined,
      gained: p.gained,
      ready: p.ready,
      connected: connected(p, now),
      score: p.score,
      answered: p.answered,
    })),
  };
}
