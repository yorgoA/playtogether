import { describe, expect, it } from 'vitest';
import { RoomSnapshot } from '../lib/contract';
import { mutate, newRoom, snapshot } from '../lib/server/session';

function match() {
  const room = newRoom('ABCD', { game: 'pyramid' });
  const host = (command: Record<string, unknown>) => mutate(room, command, room.hostToken, 1000);
  const player = (name: string) => {
    const { playerId, playerToken } = mutate(room, { action: 'join', name }, '', 1000).extras;
    const send = (command: Record<string, unknown>) => mutate(room, command, playerToken, 1000);
    send({ action: 'ready', ready: true });
    return { id: playerId, send, view: () => snapshot(room, 1000, playerToken) };
  };
  const ana = player('Ana');
  expect(() => host({ action: 'start' })).toThrow('two to eight');
  const sam = player('Sam');
  host({ action: 'start' });
  return { room, host, ana, sam, board: room.pyramid! };
}

describe('Pyramid room', () => {
  it('deals from one deck and hides hands and unrevealed cards', () => {
    const { room, ana, sam, board, host } = match();
    expect(new Set([...board.cards, ...Object.values(board.hands).flat()]).size).toBe(23);
    expect(ana.view().pyramid?.hand).toEqual(board.hands[ana.id]);
    expect(sam.view().pyramid?.hand).toEqual(board.hands[sam.id]);
    const publicRoom = RoomSnapshot.parse(snapshot(room, 1000, room.hostToken));
    expect(publicRoom.pyramid?.hand).toBeUndefined();
    expect(publicRoom.pyramid?.cards).toEqual(Array(15).fill(null));
    expect(() => ana.send({ action: 'pyramidFlip', index: -1 })).toThrow('requires the host');
    host({ action: 'pyramidFlip', index: -1 });
    expect(ana.view().pyramid?.hand).toBeUndefined();
    expect(ana.view().pyramid?.cards).toEqual([board.cards[0], ...Array(14).fill(null)]);
    expect(() => host({ action: 'pyramidFlip', index: -1 })).toThrow('Wait for');
  });

  it('settles bluff, match and accept outcomes and finishes at the peak', () => {
    const { room, ana, sam, board, host } = match();
    // Fix ranks for deterministic claims without relying on the shuffle.
    board.cards[0] = 'AS';
    board.cards[5] = 'KS';
    board.cards[14] = 'QS';
    board.hands[ana.id] = ['2H', 'KD', '3H', '4H'];
    const flip = () => host({ action: 'pyramidFlip', index: board.index });
    const claim = (slot: number) => ana.send({ action: 'pyramidClaim', index: board.index, slot, target: sam.id });
    const reply = (call: boolean) => sam.send({ action: 'pyramidReply', index: board.index, call });
    flip();
    claim(0);
    expect(ana.view().pyramid?.claim).toEqual({ from: ana.id, to: sam.id });
    expect(() => flip()).toThrow('Wait for');
    expect(() => ana.send({ action: 'pyramidReply', index: 0, call: true })).toThrow('waiting for you');
    reply(true);
    expect(board.outcome).toMatchObject({ verdict: 'bluff', loser: ana.id, points: 1, card: '2H' });
    while (board.index < 5) flip();
    expect(() => claim(0)).toThrow('unused card');
    claim(1);
    reply(true);
    expect(board.outcome).toMatchObject({ verdict: 'match', loser: sam.id, points: 2, card: 'KD' });
    while (board.index < 14) flip();
    claim(2);
    reply(false);
    expect(board.outcome).toMatchObject({ verdict: 'accepted', loser: sam.id, points: 5 });
    expect(board.outcome?.card).toBeUndefined();
    expect(room.players.map(player => player.score)).toEqual([-1, -7]);
    expect(RoomSnapshot.parse(ana.view()).pyramid?.slots).toEqual([false, false, false, true]);
    flip();
    expect(room.phase).toBe('results');
    host({ action: 'restart' });
    expect(room.pyramid?.index).toBe(-1);
    expect(room.players.map(player => player.score)).toEqual([0, 0]);
  });
});
