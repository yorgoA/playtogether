export type Game = (typeof import('../contract/rooms').gameIds)[number];

export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const games: Record<Game, { name: string; minPlayers: number; maxPlayers: number }> = {
  quiz: { name: 'Quiz Volt', minPlayers: 1, maxPlayers: 12 },
  reaction: { name: 'Reaction Duel', minPlayers: 2, maxPlayers: 8 },
  settlers: { name: 'Island Settlers', minPlayers: 2, maxPlayers: 4 },
  pyramid: { name: 'Pyramid', minPlayers: 2, maxPlayers: 8 },
  storm: { name: 'Storm Deck', minPlayers: 2, maxPlayers: 8 },
  kings: { name: 'Kings Cup', minPlayers: 2, maxPlayers: 8 },
};
