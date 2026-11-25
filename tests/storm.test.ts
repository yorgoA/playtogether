import { describe, expect, it } from 'vitest';
import { RoomSnapshot } from '../lib/contract';
import { mutate, snapshot } from '../lib/server/session';
import { turnMs } from '../lib/server/storm';
import { fits, isPower } from '../lib/storm/rules';
import { DROP, T0, table, type Command } from './helpers';

function match(count = 3) {
  const t = table('storm', count);
  t.host({ action: 'start' });
  const s = t.room.storm!;
  // Seat 0 goes first, in seat order, with a known table.
  s.order = t.seats.map((seat) => seat.id);
  s.turn = s.order[0];
  s.piles = ['E3', 'T7'];
  for (const id of s.order) s.hands[id] = ['F1', 'F1', 'F5'];
  const ids = s.order.slice();
  const move = (i: number, command: Command, now = T0) =>
    t.play(i, { action: 'storm', seq: s.seq, ...command }, now);
  const hold = (i: number, ...cards: string[]) => (s.hands[ids[i]] = cards);
  return { ...t, s, ids, move, hold };
}

describe('Storm Deck', () => {
  it('matches elements and neighbours, and only neighbours in a streak', () => {
    expect(fits('E8', 'E3', false)).toBe(true);
    expect(fits('E8', 'E3', true)).toBe(false);
    expect(fits('T8', 'E1', true)).toBe(true);
    expect(fits('T3', 'E3', false)).toBe(false);
    expect(fits('G', 'E3', false)).toBe(false);
  });

  it('deals one deck and shows each hand only to its owner', () => {
    const { room, seats } = table('storm', 8);
    const host = (c: Command) => mutate(room, c, room.hostToken, T0);
    host({ action: 'start' });
    const s = room.storm!;
    expect([...s.deck, ...s.piles, ...Object.values(s.hands).flat()]).toHaveLength(74);
    expect(s.piles.some(isPower)).toBe(false);
    for (const seat of seats) {
      const view = RoomSnapshot.parse(snapshot(room, T0, seat.token)).storm!;
      expect(view.hand).toEqual(s.hands[seat.id]);
      expect(view.sizes[seat.id]).toBe(7);
    }
    expect(RoomSnapshot.parse(snapshot(room, T0, room.hostToken)).storm!.hand).toBeUndefined();
  });

  it('runs a streak on one pile and passes the turn when it cannot go on', () => {
    const { s, ids, move, hold } = match();
    hold(0, 'E5', 'F6', 'T7', 'F1');
    move(0, { move: 'play', card: 'E5', pile: 0 });
    expect(s).toMatchObject({ turn: ids[0], streak: 0 });
    expect(() => move(0, { move: 'play', card: 'F6', pile: 1 })).toThrow('one pile');
    expect(() => move(0, { move: 'play', card: 'F1', pile: 0 })).toThrow('does not fit');
    expect(() => move(0, { move: 'draw' })).toThrow('end your turn');
    move(0, { move: 'play', card: 'F6', pile: 0 });
    move(0, { move: 'play', card: 'T7', pile: 0 });
    expect(s).toMatchObject({ turn: ids[1], streak: null, piles: ['T7', 'T7'] });
  });

  it('refuses stale, out of turn and unheld moves', () => {
    const { move, hold } = match();
    hold(0, 'E5', 'F1');
    expect(() => move(1, { move: 'draw' })).toThrow('your turn');
    expect(() => move(0, { move: 'play', card: 'E4', pile: 0 })).toThrow('from your hand');
    expect(() => move(0, { move: 'end' })).toThrow('Play a card');
    move(0, { move: 'draw' });
    expect(() => move(0, { move: 'draw', seq: 0 })).toThrow('moved on');
  });

  it('breaks the storm over whoever holds the fewest cards', () => {
    const { s, ids, move, hold } = match();
    s.storm = 4;
    hold(1, 'F1');
    move(0, { move: 'draw' });
    expect(s.event?.hit).toEqual([ids[1]]);
    expect(s.hands[ids[1]]).toHaveLength(3);
    expect(s.storm).toBe(0);
  });

  it('plays gusts and calms', () => {
    const { s, ids, room, move, hold } = match();
    hold(0, 'G', 'F1', 'F5');
    expect(() => move(0, { move: 'play', card: 'G', target: ids[0], give: 'F1' })).toThrow('another player');
    expect(() => move(0, { move: 'play', card: 'G', target: ids[1], give: 'G' })).toThrow('blow away');
    move(0, { move: 'play', card: 'G', target: ids[1], give: 'F1' });
    expect(s.hands[ids[0]]).toEqual(['F5']);
    expect(s.hands[ids[1]]).toHaveLength(4);
    // What was given stays secret from the rest of the table.
    expect(JSON.stringify(snapshot(room, T0, room.hostToken).storm!.event)).not.toContain('F1');
    hold(1, 'C', 'F1');
    s.storm = 3;
    move(1, { move: 'play', card: 'C' });
    expect(s.storm).toBe(0);
  });

  it('ends on an empty hand, even with a gust, and scores what is left', () => {
    const { room, move, hold, host } = match();
    hold(0, 'G');
    move(0, { move: 'play', card: 'G' });
    expect(room.phase).toBe('results');
    expect(room.players.map((p) => p.score)).toEqual([10, 7, 7]);
    host({ action: 'restart' });
    expect(room.phase).toBe('playing');
  });

  it('draws for a player who runs out of time, but not while paused', () => {
    const { s, ids, room, host, play } = match();
    host({ action: 'pause' }, T0 + 1000);
    host({ action: 'view' }, T0 + turnMs * 2);
    expect(s.seq).toBe(0);
    host({ action: 'resume' }, T0 + turnMs * 2);
    const due = room.deadline;
    play(1, { action: 'view' }, due - 1);
    expect(s.turn).toBe(ids[0]);
    play(1, { action: 'view' }, due);
    expect(s.turn).toBe(ids[1]);
    expect(room.deadline).toBe(due + turnMs);
  });

  it('carries on when a player is removed, and ends with one left', () => {
    const { s, ids, room, host, ping } = match();
    ping(1, T0 + DROP);
    ping(2, T0 + DROP);
    host({ action: 'kick', playerId: ids[0] }, T0 + DROP);
    expect(s.turn).toBe(ids[1]);
    expect(room.deadline).toBe(T0 + DROP + turnMs);
    ping(2, T0 + DROP * 1.5);
    ping(2, T0 + DROP * 2);
    host({ action: 'kick', playerId: ids[1] }, T0 + DROP * 2);
    expect(room.phase).toBe('results');
  });

  it('keeps the clock when someone else leaves, and counts from the pause when the turn moves', () => {
    const { s, ids, room, host, ping } = match(4);
    const due = room.deadline;
    ping(0, T0 + DROP);
    host({ action: 'kick', playerId: ids[3] }, T0 + DROP);
    expect(s.turn).toBe(ids[0]);
    expect(room.deadline).toBe(due);
    host({ action: 'pause' }, T0 + DROP + 1000);
    host({ action: 'kick', playerId: ids[0] }, T0 + DROP * 2 + 5000);
    expect(s.turn).toBe(ids[1]);
    expect(room.phase).toBe('paused');
    expect(room.deadline).toBe(T0 + DROP + 1000 + turnMs);
  });

  it('refuses moves outside a match', () => {
    const fails = (run: () => unknown) => {
      try {
        run();
      } catch (e) {
        return e;
      }
    };
    const lobby = table('storm', 2);
    const quiz = table('quiz', 2);
    for (const { play } of [lobby, quiz])
      expect(fails(() => play(0, { action: 'storm', move: 'draw', seq: 0 }))).toMatchObject({
        status: 409,
        message: 'Storm Deck is not active.',
      });
  });

  it('ends when nobody can draw or play', () => {
    const { s, room, move } = match(2);
    s.deck = [];
    move(0, { move: 'draw' });
    move(1, { move: 'draw' });
    expect(room.phase).toBe('results');
  });

  it('always finishes, without losing a card', () => {
    for (const count of [2, 4, 8])
      for (let n = 0; n < 40; n++) {
        const { room, seats, host } = table('storm', count);
        host({ action: 'start' });
        const s = room.storm!;
        let moves = 0;
        while (room.phase === 'playing') {
          expect(++moves).toBeLessThan(1500);
          const hand = s.hands[s.turn];
          const spots = hand.flatMap((card) =>
            [0, 1].flatMap((pile) =>
              (s.streak ?? pile) === pile && fits(card, s.piles[pile], s.streak !== null)
                ? [{ move: 'play', card, pile }]
                : [],
            ),
          );
          const power = hand.findIndex(isPower);
          const target = s.order.find((id) => id !== s.turn);
          const command: Command =
            spots[0] ??
            (power >= 0
              ? { move: 'play', card: hand[power], target, give: hand.filter((_, i) => i !== power)[0] }
              : { move: 'draw' });
          const { token } = seats.find((seat) => seat.id === s.turn)!;
          mutate(room, { action: 'storm', seq: s.seq, ...command }, token, T0);
          const all = [...s.deck, ...s.spent, ...s.piles, ...Object.values(s.hands).flat()];
          expect(all).toHaveLength(74);
        }
      }
  });
});
