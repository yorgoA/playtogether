import type { RoomSnapshot } from '../contract/rooms';

// Read by the server and the screens, so it stays free of the contract's schemas.

// How well a bot plays.
export const difficulties = ['easy', 'normal', 'hard'] as const;
export type Difficulty = (typeof difficulties)[number];
// How many bots each game seats, sent with `addBot`. Games not listed have no bots yet.
export const botSeats: Partial<Record<RoomSnapshot['game'], number>> = { settlers: 3, storm: 3, quiz: 3, reaction: 3 };
