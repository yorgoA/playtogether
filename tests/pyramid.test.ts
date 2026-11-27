import { describe, expect, it } from 'vitest';
import { RoomSnapshot } from '../lib/contract';
import { mutate, newRoom, snapshot, type Room } from '../lib/server/session';

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
    const claim = (slot: number) =>
      ana.send({ action: 'pyramidClaim', index: board.index, slot, target: sam.id });
    const reply = (call: boolean) => sam.send({ action: 'pyramidReply', index: board.index, call });
    flip();
    claim(0);
    expect(ana.view().pyramid?.claim).toEqual({ from: ana.id, to: sam.id });
    expect(() => flip()).toThrow('Wait for');
    expect(() => ana.send({ action: 'pyramidReply', index: 0, call: true })).toThrow('waiting for you');
    reply(true);
    expect(board.outcome).toMatchObject({ verdict: 'bluff', loser: ana.id, points: 2, card: '2H' });
    ana.send({ action: 'pyramidClaim', index: 0, slot: 3, target: sam.id });
    reply(false);
    expect(board.outcome).toMatchObject({ verdict: 'accepted', points: 1 });
    while (board.index < 5) flip();
    expect(() => claim(0)).toThrow('unused card');
    claim(1);
    reply(true);
    expect(board.outcome).toMatchObject({ verdict: 'match', loser: sam.id, points: 4, card: 'KD' });
    while (board.index < 14) flip();
    claim(2);
    reply(false);
    expect(board.outcome).toMatchObject({ verdict: 'accepted', loser: sam.id, points: 5 });
    expect(board.outcome?.card).toBeUndefined();
    expect(room.players.map((player) => player.score)).toEqual([-2, -10]);
    expect(RoomSnapshot.parse(ana.view()).pyramid?.slots).toEqual([false, false, false, false]);
    flip();
    expect(room.phase).toBe('results');
    host({ action: 'restart' });
    expect(room.pyramid?.index).toBe(-1);
    expect(room.players.map((player) => player.score)).toEqual([0, 0]);
  });

  it('plays a whole match with the room saved and read back between every request', () => {
    // As D1 or a Durable Object does: nothing survives a request but what the room stores.
    let stored = JSON.stringify(newRoom('ABCD', { game: 'pyramid' }));
    const call = (command: Record<string, unknown>, token: string) => {
      const room: Room = JSON.parse(stored);
      const { extras } = mutate(room, command, token, 1000);
      stored = JSON.stringify(room);
      return extras;
    };
    const room = () => JSON.parse(stored) as Room;
    const hostToken = room().hostToken;
    const seat = (name: string) => {
      const { playerId, playerToken } = call({ action: 'join', name }, '');
      call({ action: 'ready', ready: true }, playerToken);
      return { id: playerId, token: playerToken };
    };
    const [ana, sam] = [seat('Ana'), seat('Sam')];
    call({ action: 'start' }, hostToken);
    const index = () => room().pyramid!.index;
    call({ action: 'pyramidFlip', index: -1 }, hostToken);
    const rank = room().pyramid!.cards[0][0];
    const slot = room().pyramid!.hands[ana.id].findIndex((card) => card![0] !== rank);
    call({ action: 'pyramidClaim', index: 0, slot, target: sam.id }, ana.token);
    call({ action: 'pyramidReply', index: 0, call: true }, sam.token);
    // A bluff called on the first level: the bluffer drinks two, shown at once.
    const view = RoomSnapshot.parse(snapshot(room(), 1000, hostToken));
    expect(view.pyramid?.outcome).toMatchObject({ verdict: 'bluff', loser: ana.id, points: 2 });
    expect(view.players.map((p) => p.score)).toEqual([-2, 0]);
    while (index() < 14) call({ action: 'pyramidFlip', index: index() }, hostToken);
    call({ action: 'pyramidFlip', index: 14 }, hostToken);
    expect(room().phase).toBe('results');
    expect(room().players.map((p) => p.score)).toEqual([-2, 0]);
  });

  it('frees a claim when either player leaves, and ends once one player is left', () => {
    const room = newRoom('ABCD', { game: 'pyramid' });
    const host = (command: Record<string, unknown>, now = 1000) => mutate(room, command, room.hostToken, now);
    const seat = (name: string) => {
      const { playerId, playerToken } = mutate(room, { action: 'join', name }, '', 1000).extras;
      mutate(room, { action: 'ready', ready: true }, playerToken, 1000);
      return {
        id: playerId,
        send: (command: Record<string, unknown>) => mutate(room, command, playerToken, 1000),
      };
    };
    const [ana, sam, leo] = [seat('Ana'), seat('Sam'), seat('Leo')];
    host({ action: 'start' });
    host({ action: 'pyramidFlip', index: -1 });
    const slot = room.pyramid!.hands[ana.id].findIndex(Boolean);
    ana.send({ action: 'pyramidClaim', index: 0, slot, target: sam.id });
    // Only a phone gone quiet can be removed: 30 s later, Sam and Leo have.
    host({ action: 'kick', playerId: sam.id }, 31_000);
    expect(room.pyramid!.claim).toBeNull();
    expect(room.phase).toBe('playing');
    host({ action: 'kick', playerId: leo.id }, 31_000);
    expect(room.phase).toBe('results');
    expect(() => ana.send({ action: 'pyramidClaim', index: 0, slot, target: sam.id })).toThrow(
      'Pyramid is not active.',
    );
  });
});
