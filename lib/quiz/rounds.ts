import type { RoomSnapshot } from '../contract/rooms';

// How many rounds the host can choose. Games not listed here ignore rounds.
export const roundChoices: Partial<Record<RoomSnapshot['game'], readonly number[]>> = {
  quiz: [5, 7, 10],
  reaction: [2, 3, 4],
};
