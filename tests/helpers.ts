import { mutate, newRoom, type Room } from '../lib/server/session';

export type Command = Record<string, unknown>;
export const T0 = 1_000_000;
// Longer than the 25 second window in which a silent phone still counts as connected.
export const DROP = 26_000;

export function table(game: string, count: number, rounds = 2) {
  const room: Room = newRoom('TEST', { game, rounds });
  const seats = Array.from({ length: count }, (_, i) => {
    const { extras } = mutate(room, { action: 'join', name: 'P' + i }, '', T0);
    mutate(room, { action: 'ready', ready: true }, extras.playerToken, T0);
    return { id: extras.playerId, token: extras.playerToken };
  });
  const host = (command: Command, now = T0) => mutate(room, command, room.hostToken, now);
  const play = (i: number, command: Command, now = T0) => mutate(room, command, seats[i].token, now);
  const ping = (i: number, now: number) => play(i, { action: 'view' }, now);
  return { room, seats, host, play, ping };
}
