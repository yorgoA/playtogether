import {
  advanceRace,
  boostPads,
  createRace,
  drive,
  hazards,
  publicRace,
  raceScores,
  resumeRace,
} from './racing';
import { GameError, games, type Game, type RoundData } from './games';

import { gameIds, type RoomSnapshot } from '../contract';
import { claimPyramid, flipPyramid, newPyramid, pyramidView, resolvePyramid, type Pyramid } from './pyramid';
import { islandMove, startIsland } from './island';
import { handSize, pointsFor, type Island } from '../island/board';
import { botMove } from './island-bot';
type Player = {
  bot?: boolean;
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
  deck: RoundData[];
  botAt?: number;
  island?: Island;
  pyramid?: Pyramid;
  revealing?: boolean;
  race?: ReturnType<typeof createRace>;
  started: number;
  deadline: number;
  signalAt: number;
  pausedAt: number;
};
type Command = Record<string, unknown>;
const connected = (p: Player, now: number) => !!p.bot || now - p.lastSeen < 25000;
const revealMs = 3500;
// Phones learn the signal shortly before it fires, so every screen can show it together.
const signalLeadMs = 800;
// Nobody reacts faster than this, so a quicker tap was a guess.
const fastestReactionMs = 80;
// Most of a late tap's delay we accept as network time.
const networkAllowanceMs = 1500;
function gameId(value: unknown): Game {
  const game = gameIds.find((id) => id === value);
  if (game) return game;
  throw new GameError('Choose an available game.');
}
function roundCount(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10) return value;
  throw new GameError('Choose between 1 and 10 rounds.');
}
export function newRoom(code: string, body: Command): Room {
  return {
    code,
    hostToken: crypto.randomUUID(),
    game: gameId(body.game ?? 'quiz'),
    phase: 'lobby',
    players: [],
    rounds: roundCount(body.rounds ?? 5),
    round: 0,
    deck: [],
    started: 0,
    deadline: 0,
    signalAt: 0,
    pausedAt: 0,
  };
}
function beginRound(r: Room, now: number) {
  r.round++;
  r.revealing = false;
  r.started = now;
  r.deadline = now + games[r.game].duration;
  r.signalAt = r.game === 'reaction' ? now + games[r.game].signalDelay() : 0;
  r.players.forEach((p) => {
    p.answered = false;
    p.reactionMs = undefined;
    p.early = undefined;
    p.gained = 0;
  });
}
function playIsland(r: Room, p: Player, command: Command, now: number) {
  const board = r.island!;
  islandMove(board, p.id, p.name, command);
  p.score = pointsFor(board, p.id);
  if (p.score >= 6) r.phase = 'results';
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
function advance(r: Room, now: number) {
  if (r.phase !== 'playing' || r.game === 'settlers' || r.game === 'pyramid') return false;
  if (r.game === 'turbo' && r.race) {
    advanceRace(r.race, Math.min(now, r.deadline));
    const scores = raceScores(r.race, r.started);
    for (const player of r.players) player.score = scores[player.id] || 0;
    if (now < r.deadline && r.race.cars.some((c) => c.finishedAt === null)) return false;
    r.phase = 'results';
    r.deadline = 0;
    return true;
  }
  if (now < r.deadline) return false;
  if (!r.revealing) {
    r.revealing = true;
    r.deadline = now + revealMs;
    return true;
  }
  if (r.round >= r.rounds) {
    r.phase = 'results';
    r.deadline = 0;
  } else beginRound(r, now);
  return true;
}
function lobby(r: Room) {
  r.revealing = false;
  r.phase = 'lobby';
  r.round = 0;
  r.deadline = 0;
  r.signalAt = 0;
  r.deck = [];
  delete r.race;
  delete r.island;
  delete r.pyramid;
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
function revealWhenAllAnswered(r: Room, now: number) {
  if (!r.players.every((p) => p.answered)) return;
  r.revealing = true;
  r.deadline = now + revealMs;
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
  if (r.race) r.race.cars = r.race.cars.filter((c) => c.id !== p.id);
  if (r.phase !== 'playing' && r.phase !== 'paused') return;
  if (!r.players.length) {
    lobby(r);
    return;
  }
  if (r.pyramid) {
    const claim = r.pyramid.claim;
    if (claim && (claim.from === p.id || claim.to === p.id)) r.pyramid.claim = null;
    if (r.players.length < 2) r.phase = 'results';
    return;
  }
  // While paused, the deadline moves forward on resume.
  if (r.race || r.revealing) return;
  revealWhenAllAnswered(r, r.phase === 'paused' ? r.pausedAt : now);
}
function start(r: Room, now: number) {
  if (r.game === 'settlers' && r.players.length < 2)
    throw new GameError('Island Settlers needs two to four players.');
  if (r.game === 'pyramid' && r.players.length < 2)
    throw new GameError('Pyramid needs two to eight players.');
  if (!r.players.some((p) => !p.bot && !p.standIn)) throw new GameError('Join with a phone before starting.');
  if (r.players.some((p) => !p.ready || !(p.standIn || connected(p, now))))
    throw new GameError('Every player must be connected and ready.');
  lobby(r);
  r.phase = 'playing';
  if (r.game === 'pyramid') {
    r.pyramid = newPyramid(r.players.map((p) => p.id));
    return;
  }
  r.deck = games[r.game].prepare(r.rounds);
  beginRound(r, now);
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
  if (r.game === 'turbo')
    r.race = createRace(
      r.players.map((p) => p.id),
      now,
    );
}
function textField(value: unknown, max: number, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max)
    throw new GameError('Choose a valid ' + label + '.');
  return value.trim();
}
export function mutate(r: Room, command: Command, token: string, now: number) {
  const { action } = command;
  let dirty = advance(r, now);
  const extras: Record<string, string> = {};
  if (action === 'join') {
    const wanted = typeof command.name === 'string' ? command.name.trim().toLowerCase() : '';
    const dropped = r.players.find((p) => p.name.toLowerCase() === wanted && !connected(p, now));
    if (dropped && r.phase !== 'ended') {
      // A fresh token moves the seat to this phone; the old one stops working.
      dropped.token = crypto.randomUUID();
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
  if (action === 'ready' && player) {
    if (r.phase !== 'lobby' || typeof command.ready !== 'boolean')
      throw new GameError('Ready status can be set in the lobby.');
    player.ready = command.ready;
  } else if (action === 'drive' && player) {
    if (r.phase === 'results' && r.game === 'turbo') return { dirty, extras };
    if (r.phase !== 'playing' || r.game !== 'turbo' || !r.race)
      throw new GameError('The race is not active.', 409);
    const { steering, accelerate, brake, powerUp } = command;
    if (
      typeof steering !== 'number' ||
      !Number.isFinite(steering) ||
      Math.abs(steering) > 1 ||
      typeof accelerate !== 'number' ||
      !Number.isFinite(accelerate) ||
      accelerate < 0 ||
      accelerate > 1 ||
      typeof brake !== 'number' ||
      !Number.isFinite(brake) ||
      brake < 0 ||
      brake > 1 ||
      typeof powerUp !== 'boolean'
    )
      throw new GameError('Invalid driving input.');
    drive(r.race, player.id, { steering, accelerate, brake, powerUp, drift: command.drift === true }, now);
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
  } else if (action === 'input' && player) {
    if (r.game === 'settlers') throw new GameError('Use the island controls.');
    if (r.game === 'pyramid') throw new GameError('Use the Pyramid controls.');
    if (r.game === 'turbo') throw new GameError('Use your driving controls.');
    if (r.phase !== 'playing' || r.revealing || command.round !== r.round)
      throw new GameError('This round is closed.', 409);
    if (player.answered) return { dirty, extras };
    let points = 0;
    if (r.game === 'reaction') {
      const ms = reactionTime(command, now, r.signalAt);
      if (ms === null) player.early = true;
      else {
        player.reactionMs = ms;
        points = games.reaction.score(r.deck[r.round - 1], ms, now, r.started);
      }
    } else {
      if (typeof command.value !== 'number') throw new GameError('Invalid input.');
      points = games[r.game].score(r.deck[r.round - 1], command.value, now, r.started);
    }
    player.gained = points;
    player.score += points;
    player.answered = true;
    revealWhenAllAnswered(r, now);
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
        }
        if (command.rounds !== undefined) r.rounds = roundCount(command.rounds);
        break;
      case 'start':
        if (r.phase !== 'lobby' && r.phase !== 'results')
          throw new GameError('A match is already in progress.');
        start(r, now);
        break;
      case 'pyramidFlip':
        if (!r.pyramid || r.phase !== 'playing') throw new GameError('Pyramid is not active.', 409);
        if (flipPyramid(r.pyramid, command.index)) r.phase = 'results';
        break;
      case 'restart':
        start(r, now);
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
        // A fresh signal keeps resuming from giving away the moment.
        if (r.game === 'reaction' && !r.revealing) {
          r.started = now;
          r.deadline = now + games.reaction.duration;
          r.signalAt = now + games.reaction.signalDelay();
        }
        if (r.race) resumeRace(r.race, delta);
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
  const board = r.island;
  const island = board
    ? (({ hands, ...publicBoard }) => ({
        ...publicBoard,
        hand: viewer ? hands[viewer.id] : undefined,
        // How many cards everyone holds is public; which ones is not.
        handSizes: Object.fromEntries(Object.entries(hands).map(([id, hand]) => [id, handSize(hand)])),
      }))(board)
    : undefined;
  const clock = r.phase === 'paused' ? r.pausedAt : now;
  const signalAt = r.signalAt && clock >= r.signalAt - signalLeadMs ? r.signalAt : null;
  const q = r.round && ['playing', 'paused'].includes(r.phase) ? r.deck[r.round - 1] : null;
  return {
    island,
    pyramid: r.pyramid ? pyramidView(r.pyramid, viewer?.id) : undefined,
    code: r.code,
    game: r.game,
    phase: r.phase,
    rounds: r.rounds,
    round: r.round,
    deadline: r.deadline,
    signalAt,
    serverTime: now,
    pausedAt: r.pausedAt,
    revealing: Boolean(r.revealing),
    correct: r.revealing && q && r.game === 'quiz' ? q.correct : null,
    racers: r.race ? publicRace(r.race) : [],
    pads: r.game === 'turbo' ? boostPads : [],
    hazards: r.game === 'turbo' ? hazards : [],
    question: q ? { text: q.text, options: q.options } : null,
    players: r.players.map((p) => ({
      bot: p.bot,
      standIn: p.standIn,
      early: p.early,
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      reactionMs: p.reactionMs,
      gained: p.gained,
      ready: p.ready,
      connected: connected(p, now),
      score: p.score,
      answered: p.answered,
    })),
  };
}
