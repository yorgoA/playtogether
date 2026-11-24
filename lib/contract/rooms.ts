import { z } from 'zod';

// The room API, described once. The server checks requests against the command schemas, and the tests check
// real responses against the response schemas. A field added, removed or retyped on either side fails CI
// until this file (and the screens that read it) agree.

export const gameIds = ['quiz', 'reaction', 'turbo', 'settlers'] as const;
export const resources = ['timber', 'clay', 'grain', 'wool', 'ore'] as const;
export const pieces = ['road', 'settlement', 'city'] as const;
const Game = z.enum(gameIds);
const Resource = z.enum(resources);
const Piece = z.enum(pieces);
const Phase = z.enum(['lobby', 'playing', 'paused', 'results', 'ended']);
const IslandPhase = z.enum(['settlement', 'road', 'roll', 'harvest', 'discard', 'robber', 'steal', 'build']);
// All five resources are always present, as zero when the player has none.
const Hand = z
  .object({ timber: z.number(), clay: z.number(), grain: z.number(), wool: z.number(), ore: z.number() })
  .strict();

// ---- Requests: POST /api/rooms and POST /api/rooms/:code -----------------------------------------------

export const CreateRoomRequest = z.object({ game: Game.optional(), rounds: z.number().int().min(1).max(10).optional() });

const nothing = (action: string) => z.object({ action: z.literal(action) });
// Sent by a phone with its player token.
const playerCommands = [
  z.object({
    action: z.literal('join'),
    name: z.string().min(1).max(40),
    avatar: z.string().max(40).optional(),
    color: z.string().max(16).optional(),
  }),
  z.object({ action: z.literal('ready'), ready: z.boolean() }),
  z.object({
    action: z.literal('drive'),
    steering: z.number().min(-1).max(1),
    accelerate: z.number().min(0).max(1),
    brake: z.number().min(0).max(1),
    powerUp: z.boolean(),
    drift: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('input'),
    round: z.number().int(),
    value: z.number().optional(),
    reactionMs: z.number().optional(),
    early: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('island'),
    move: z.string().max(20),
    revision: z.number().int(),
    piece: Piece.optional(),
    index: z.number().int().optional(),
    cards: z.array(Resource).max(40).optional(),
    target: z.string().max(60).optional(),
    resource: Resource.optional(),
    give: Resource.optional(),
    want: Resource.optional(),
  }),
] as const;
// Sent by the host screen with the host token.
const hostCommands = [
  nothing('addBot'),
  nothing('start'),
  nothing('restart'),
  nothing('pause'),
  nothing('resume'),
  nothing('lobby'),
  nothing('end'),
  z.object({ action: z.literal('configure'), game: Game.optional(), rounds: z.number().int().min(1).max(10).optional() }),
  z.object({ action: z.literal('kick'), playerId: z.string().max(60) }),
  z.object({ action: z.literal('standIn'), playerId: z.string().max(60) }),
] as const;
// Anyone in the room, including the host, may ask for the current state.
const View = nothing('view');
export const RoomCommand = z.discriminatedUnion('action', [...playerCommands, ...hostCommands, View]);
export type RoomCommand = z.infer<typeof RoomCommand>;

// ---- Responses -----------------------------------------------------------------------------------------

export const ErrorResponse = z.object({ error: z.string() }).strict();

const Player = z
  .object({
    bot: z.boolean().optional(),
    standIn: z.boolean().optional(),
    early: z.boolean().optional(),
    id: z.string(),
    name: z.string(),
    avatar: z.string(),
    color: z.string(),
    reactionMs: z.number().optional(),
    gained: z.number().optional(),
    ready: z.boolean(),
    connected: z.boolean(),
    score: z.number(),
    answered: z.boolean(),
  })
  .strict();

const Racer = z
  .object({
    id: z.string(),
    progress: z.number(),
    lane: z.number(),
    speed: z.number(),
    boostReadyAt: z.number(),
    boostUntil: z.number(),
    finishedAt: z.number().nullable(),
    impactUntil: z.number(),
    driftCharge: z.number().optional(),
    driftDirection: z.number().optional(),
  })
  .strict();

const Spot = z.object({ at: z.number(), lane: z.number() }).strict();

// What a phone or the host screen may see of an Island Settlers match. `hand` is only the viewer's own;
// `handSizes` counts everyone's cards without saying which they are.
const Island = z
  .object({
    robber: z.number().optional(),
    owed: z.record(z.string(), z.number()).optional(),
    victims: z.array(z.string()).optional(),
    rolledAt: z.number().optional(),
    order: z.array(z.string()),
    turn: z.number(),
    setup: z.number(),
    phase: IslandPhase,
    anchor: z.number(),
    revision: z.number(),
    homes: z.record(z.string(), z.object({ id: z.string(), city: z.boolean() }).strict()),
    roads: z.record(z.string(), z.string()),
    dice: z.array(z.number()),
    event: z.string(),
    offer: z.object({ give: Resource, want: Resource }).strict().nullable(),
    hand: Hand.optional(),
    handSizes: z.record(z.string(), z.number()),
  })
  .strict();

export const RoomSnapshot = z
  .object({
    island: Island.optional(),
    code: z.string().length(4),
    game: Game,
    phase: Phase,
    rounds: z.number(),
    round: z.number(),
    deadline: z.number(),
    signalAt: z.number().nullable(),
    serverTime: z.number(),
    pausedAt: z.number(),
    revealing: z.boolean(),
    correct: z.number().nullable(),
    racers: z.array(Racer),
    pads: z.array(Spot),
    hazards: z.array(Spot),
    question: z.object({ text: z.string(), options: z.array(z.string()) }).strict().nullable(),
    players: z.array(Player),
  })
  .strict();
export type RoomSnapshot = z.infer<typeof RoomSnapshot>;

// 201 for POST /api/rooms. `hostToken` goes only to the host screen that created the room.
export const CreateRoomResponse = z
  .object({ code: z.string().length(4), hostToken: z.string(), room: RoomSnapshot })
  .strict();
// 200 for GET and POST /api/rooms/:code. `playerId` and `playerToken` come back only from `join`.
export const RoomResponse = z
  .object({ room: RoomSnapshot, playerId: z.string().optional(), playerToken: z.string().optional() })
  .strict();
