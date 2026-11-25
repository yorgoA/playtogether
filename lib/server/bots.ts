import { difficulties, type Difficulty } from '../contract';
import { GameError } from './games';

export const botNames = [
  'Bip-Boop',
  'Robotine',
  'Clank',
  'Gizmo',
  'Toaster 3000',
  'Sir Beeps-a-Lot',
  'Rusty',
  'Captain Chip',
  'Sprocket',
  'Nano',
  'Bolt',
  'Widget',
];
export const botColors = ['#bc96ff', '#ffae65', '#69dafa', '#c3f76a'];

// A name nobody at the table has, ignoring case, like nicknames.
export function botName(taken: string[]) {
  const used = new Set(taken.map((name) => name.toLowerCase()));
  const free = botNames.filter((name) => !used.has(name.toLowerCase()));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  let n = 1;
  while (used.has('bot ' + n)) n++;
  return 'Bot ' + n;
}

export function botLevel(value: unknown): Difficulty {
  if (value === undefined) return 'normal';
  if (difficulties.includes(value as Difficulty)) return value as Difficulty;
  throw new GameError('Choose easy, normal or hard.');
}
