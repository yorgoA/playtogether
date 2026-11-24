import { z } from 'zod';
import { cheerEmoji } from '../quiz/rules';

// The room API, described once. The server checks requests against the command schemas, and the tests check
// real responses against the response schemas. A field added, removed or retyped on either side fails CI
// until this file (and the screens that read it) agree.

export const gameIds = ['quiz', 'reaction', 'settlers', 'pyramid', 'kings', 'storm'] as const;
export const quizTypes = ['accuracy', 'speed', 'balanced', 'minefield', 'jackpot'] as const;
export const quizPowers = ['smoke', 'half', 'wager', 'thief', 'rush', 'mirror', 'copycat'] as const;
export type QuizType = (typeof quizTypes)[number];
export type QuizPower = (typeof quizPowers)[number];
// Drinking games: opening a room for one needs an adult profile.
export const adultGames: readonly string[] = ['pyramid', 'kings'];
export const resources = ['timber', 'clay', 'grain', 'wool', 'ore'] as const;
export const devCards = ['knight', 'roads', 'bounty', 'monopoly', 'victory'] as const;
export const pieces = ['road', 'settlement', 'city'] as const;
const Game = z.enum(gameIds);
const Resource = z.enum(resources);
const Piece = z.enum(pieces);
const DevCard = z.enum(devCards);
const HeldCard = z.object({ kind: DevCard, fresh: z.boolean() }).strict();
// An element and a number, or a gust or calm.
const StormCard = z.string().regex(/^([ETDF][1-8]|G|C)$/);
const Phase = z.enum(['lobby', 'playing', 'paused', 'results', 'ended']);
const IslandPhase = z.enum(['order', 'settlement', 'road', 'roll', 'harvest', 'discard', 'robber', 'steal', 'build']);
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
    action: z.literal('storm'),
    move: z.enum(['play', 'draw', 'end']),
    seq: z.number().int(),
    card: StormCard.optional(),
    pile: z.number().int().min(0).max(1).optional(),
    // Gusts: who gets which card.
    target: z.string().max(60).optional(),
    give: StormCard.optional(),
  }),
  z.object({
    action: z.literal('kings'),
    move: z.enum(['draw', 'pick', 'tap', 'drank', 'rule', 'done', 'catch']),
    seq: z.number().int(),
    slot: z.number().int().min(0).max(51).optional(),
    target: z.string().max(60).optional(),
    text: z.string().max(60).optional(),
    // Race taps: how long after this phone showed the race the player tapped.
    ms: z.number().min(0).optional(),
    // Catches: made up for one press and sent again with it, so a repeat does not count twice.
    press: z.string().min(8).max(64).optional(),
  }),
  z.object({
    action: z.literal('pyramidClaim'),
    index: z.number().int(),
    slot: z.number().int().min(0).max(3),
    target: z.string().max(60),
  }),
  z.object({ action: z.literal('pyramidReply'), index: z.number().int(), call: z.boolean() }),
  z.object({
    action: z.literal('join'),
    // A secret the phone makes up, sent again when it repeats a join whose reply it never got.
    // It gives back the same seat, so it must be random and never shown to anyone.
    joinId: z.string().min(16).max(64).optional(),
    name: z.string().min(1).max(40),
    avatar: z.string().max(40).optional(),
    color: z.string().max(16).optional(),
  }),
  z.object({ action: z.literal('ready'), ready: z.boolean() }),
  z.object({
    action: z.literal('input'),
    round: z.number().int(),
    value: z.number().optional(),
    reactionMs: z.number().optional(),
    early: z.boolean().optional(),
    // Reaction Duel: which draw the shot belongs to.
    draw: z.number().int().optional(),
  }),
  z.object({ action: z.literal('cheer'), emoji: z.enum(cheerEmoji) }),
  // Null saves the powers for a later round.
  z.object({
    action: z.literal('quizPower'),
    round: z.number().int(),
    power: z.enum(quizPowers).nullable(),
    target: z.string().max(60).optional(),
  }),
  z.object({
    action: z.literal('island'),
    move: z.string().max(20),
    revision: z.number().int(),
    piece: Piece.optional(),
    card: DevCard.optional(),
    index: z.number().int().optional(),
    cards: z.array(Resource).max(40).optional(),
    target: z.string().max(60).optional(),
    resource: Resource.optional(),
    // For offers of several cards; `give` and `want` still work for one each.
    giveCards: z.array(Resource).max(19).optional(),
    wantCards: z.array(Resource).max(19).optional(),
    give: Resource.optional(),
    want: Resource.optional(),
  }),
] as const;
// Sent by the host screen with the host token.
const hostCommands = [
  z.object({ action: z.literal('kingsNext'), seq: z.number().int() }),
  z.object({ action: z.literal('pyramidFlip'), index: z.number().int() }),
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

// What a phone or the host screen may see of an Island Settlers match. `hand` is only the viewer's own;
// `handSizes` counts everyone's cards without saying which they are.
const Island = z
  .object({
    layout: z
      .object({
        terrain: z.array(z.union([Resource, z.literal('sand')])),
        numbers: z.array(z.number()),
        ports: z.array(z.union([Resource, z.literal('any')])),
      })
      .strict()
      .optional(),
    orderRolls: z.record(z.string(), z.array(z.number())).optional(),
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
    offer: z.object({ give: Hand, want: Hand }).strict().nullable(),
    hand: Hand.optional(),
    handSizes: z.record(z.string(), z.number()),
    // Development cards: only the viewer's own are listed. The deck itself is never sent.
    devHand: z.array(HeldCard).optional(),
    bankEmpty: z.array(Resource),
    devSizes: z.record(z.string(), z.number()),
    deckLeft: z.number(),
    devPlayed: z.boolean().optional(),
    freeRoads: z.number().optional(),
    resume: z.enum(['roll', 'build']).optional(),
    knights: z.record(z.string(), z.number()).optional(),
    longestRoad: z.string().optional(),
    strongestArmy: z.string().optional(),
  })
  .strict();

const Card = z.string().regex(/^[A23456789TJQK][SHDC]$/);
const Pyramid = z.object({
  index: z.number().int(),
  cards: z.array(Card.nullable()).length(15),
  claim: z.object({ from: z.string(), to: z.string() }).strict().nullable(),
  outcome: z.object({
    from: z.string(),
    to: z.string(),
    loser: z.string(),
    points: z.number().int(),
    verdict: z.enum(['accepted', 'match', 'bluff']),
    card: Card.optional(),
  }).strict().nullable(),
  hand: z.array(Card).optional(),
  slots: z.array(z.boolean()).length(4).optional(),
}).strict();
// Everything on a Kings Cup table is public except the cards still face down.
const Kings = z
  .object({
    left: z.array(z.boolean()).length(52),
    turn: z.string(),
    order: z.array(z.string()),
    seq: z.number().int(),
    phase: z.enum(['draw', 'pick', 'race', 'honor', 'rule', 'open']),
    card: Card.nullable(),
    slot: z.number().int(),
    racers: z.array(z.string()),
    tapped: z.array(z.string()),
    mates: z.array(z.tuple([z.string(), z.string()])),
    master: z.string().nullable(),
    rules: z.array(z.object({ by: z.string(), text: z.string() }).strict()),
    kings: z.number().int(),
    event: z
      .object({ drinkers: z.array(z.string()), amount: z.number().int(), caught: z.boolean() })
      .strict()
      .nullable(),
  })
  .strict();
// Storm Deck. `hand` is only the viewer's own; `sizes` counts everyone's cards.
const Storm = z
  .object({
    order: z.array(z.string()),
    turn: z.string(),
    seq: z.number().int(),
    piles: z.array(StormCard).length(2),
    streak: z.number().int().nullable(),
    storm: z.number().int(),
    event: z
      .object({
        kind: z.enum(['play', 'draw']),
        by: z.string(),
        card: StormCard.nullable(),
        pile: z.number().int().nullable(),
        to: z.string().nullable(),
        hit: z.array(z.string()),
      })
      .strict()
      .nullable(),
    sizes: z.record(z.string(), z.number()),
    hand: z.array(StormCard).optional(),
  })
  .strict();
export type StormView = z.infer<typeof Storm>;
// The standoff. Everything here is public.
const Duel = z
  .object({
    alive: z.array(z.string()),
    draw: z.number().int(),
    fallen: z.array(
      z.object({ id: z.string(), by: z.string().nullable(), why: z.enum(['slow', 'early', 'silent']) }).strict(),
    ),
    winner: z.string().nullable(),
    over: z.boolean(),
    wins: z.record(z.string(), z.number()),
  })
  .strict();
export type DuelView = z.infer<typeof Duel>;
// `crossed`, `picks` and the room's `correct` go only to the host screen; `mine` only to its player.
const Quiz = z
  .object({
    stage: z.enum(['intro', 'power', 'question', 'suspense', 'reveal']),
    theme: z.string(),
    type: z.enum(quizTypes),
    chosen: z.array(z.string()),
    plays: z.array(
      z
        .object({ from: z.string(), power: z.enum(quizPowers), to: z.string().nullable(), bounced: z.boolean() })
        .strict(),
    ),
    crossed: z.array(z.number()),
    picks: z.record(z.string(), z.number()),
    mine: z
      .object({
        powers: z.array(z.enum(quizPowers)),
        choice: z.enum(quizPowers).nullable(),
        smoked: z.array(z.number()),
        removed: z.array(z.number()),
        until: z.number(),
        right: z.boolean().nullable(),
        silent: z.boolean(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type QuizView = z.infer<typeof Quiz>;
export type KingsView = z.infer<typeof Kings>;
export type PyramidView = z.infer<typeof Pyramid>;

export const RoomSnapshot = z
  .object({
    island: Island.optional(),
    pyramid: Pyramid.optional(),
    kings: Kings.optional(),
    storm: Storm.optional(),
    quiz: Quiz.optional(),
    duel: Duel.optional(),
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
    question: z.object({ text: z.string(), options: z.array(z.string()) }).strict().nullable(),
    // Recent reactions, numbered so a screen shows each one once.
    cheers: z.array(z.object({ n: z.number().int(), from: z.string(), emoji: z.string() }).strict()),
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
