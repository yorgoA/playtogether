import { afterEach, describe, expect, it, vi } from 'vitest';
import { mutate, newRoom, snapshot } from '../lib/server/session';
import { DROP, T0, table } from './helpers';

afterEach(() => vi.restoreAllMocks());

describe('lobby', () => {
  it('rejects unknown games and round counts', () => {
    expect(() => newRoom('TEST', { game: 'chess' })).toThrow('available game');
    expect(() => newRoom('TEST', { rounds: 6 })).toThrow('5, 7, 10');
    expect(() => newRoom('TEST', { game: 'reaction', rounds: 5 })).toThrow('2, 3, 4');
  });
  it('rejects duplicate nicknames, ignoring case', () => {
    const { room } = table('quiz', 1);
    expect(() => mutate(room, { action: 'join', name: 'p0' }, '', T0)).toThrow('already in the room');
  });
  it('rejects players beyond the limit', () => {
    const { room } = table('settlers', 4);
    expect(() => mutate(room, { action: 'join', name: 'Extra' }, '', T0)).toThrow('full');
  });
  it('starts only when everyone is ready', () => {
    const { host, play } = table('quiz', 2);
    play(1, { action: 'ready', ready: false });
    expect(() => host({ action: 'start' })).toThrow('connected and ready');
  });
  it('needs two seats for Island Settlers and lets a bot fill one', () => {
    const { room, host } = table('settlers', 1);
    expect(() => host({ action: 'start' })).toThrow('two to four');
    host({ action: 'addBot' });
    host({ action: 'start' });
    expect(room.phase).toBe('playing');
  });
});

describe('permissions and privacy', () => {
  it('keeps host actions from players and strangers', () => {
    const { room, play } = table('quiz', 1);
    expect(() => play(0, { action: 'start' })).toThrow('requires the host');
    expect(() => mutate(room, { action: 'view' }, 'wrong', T0)).toThrow('Join this room');
    expect(() => mutate(room, { action: 'view' }, '', T0)).toThrow('Join this room');
  });
  it('never exposes tokens, quiz answers or other hands', () => {
    const quiz = table('quiz', 1);
    quiz.host({ action: 'start' });
    const island = table('settlers', 2);
    island.host({ action: 'start' });
    const view = snapshot(island.room, T0, island.seats[0].token);
    expect(view.island).not.toHaveProperty('hands');
    expect(view.island!.hand).toBeDefined();
    const [me, other] = island.room.players;
    island.room.island!.hands[me.id].ore = 2;
    island.room.island!.hands[other.id].wool = 3;
    for (const token of ['', island.seats[0].token])
      expect(snapshot(island.room, T0, token).island!.handSizes).toEqual({ [me.id]: 2, [other.id]: 3 });
    expect(snapshot(island.room, T0).island!.hand).toBeUndefined();
    island.room.island!.dev = {
      [me.id]: [{ kind: 'knight', fresh: true }],
      [other.id]: [{ kind: 'victory', fresh: false }],
    };
    const mine = snapshot(island.room, T0, island.seats[0].token).island!;
    expect(mine.devHand).toEqual([{ kind: 'knight', fresh: true }]);
    expect(mine.devSizes).toEqual({ [me.id]: 1, [other.id]: 1 });
    for (const seen of [mine, snapshot(island.room, T0).island!]) {
      expect(seen).not.toHaveProperty('deck');
      expect(seen).not.toHaveProperty('dev');
      expect(seen.deckLeft).toBe(25);
      expect(JSON.stringify(seen)).not.toContain('victory');
    }
    const json = JSON.stringify(view);
    for (const secret of [island.room.hostToken, ...island.seats.map((s) => s.token)])
      expect(json).not.toContain(secret);
  });
});

describe('repeating a join', () => {
  const joinId = 'a-secret-join-id-1';
  const join = (room: Parameters<typeof mutate>[0], extra: Record<string, unknown> = {}, now = T0) =>
    mutate(room, { action: 'join', name: 'Ana', joinId, ...extra }, '', now).extras;

  it('gives the same seat back, even when the room is full or playing', () => {
    const { room, host, seats } = table('settlers', 3);
    const first = join(room);
    expect(join(room)).toEqual(first);
    expect(room.players).toHaveLength(4);
    mutate(room, { action: 'ready', ready: true }, first.playerToken, T0);
    host({ action: 'start' });
    expect(join(room)).toEqual(first);
    expect(room.players.map((p) => p.id)).toEqual([...seats.map((s) => s.id), first.playerId]);
  });
  it('needs the same id: another phone cannot take a connected seat', () => {
    const { room } = table('quiz', 1);
    join(room);
    expect(() => join(room, { joinId: 'another-secret-id-2' })).toThrow('already in the room');
    expect(() => join(room, { joinId: undefined })).toThrow('already in the room');
  });
  it('does not match players who joined without an id', () => {
    const { room, seats } = table('quiz', 2);
    const { playerId } = mutate(room, { action: 'join', name: 'Ben' }, '', T0).extras;
    expect(seats.map((s) => s.id)).not.toContain(playerId);
    expect(join(room).playerId).not.toBe(playerId);
  });
  it('stops working once another phone has rejoined by nickname', () => {
    const { room } = table('quiz', 1);
    join(room);
    const taken = join(room, { joinId: 'another-secret-id-2' }, T0 + DROP);
    expect(() => join(room, {}, T0 + DROP)).toThrow('already in the room');
    expect(join(room, { joinId: 'another-secret-id-2' }, T0 + DROP)).toEqual(taken);
  });
  it('is never shown to anyone', () => {
    const { room } = table('quiz', 1);
    const { playerToken } = join(room);
    for (const token of ['', playerToken, room.hostToken])
      expect(JSON.stringify(snapshot(room, T0, token))).not.toContain(joinId);
  });
  it('takes a seat back from a stand-in bot', () => {
    const { room, host } = table('settlers', 1);
    const first = join(room);
    mutate(room, { action: 'ready', ready: true }, first.playerToken, T0);
    host({ action: 'start' });
    host({ action: 'standIn', playerId: first.playerId }, T0 + DROP);
    expect(join(room, {}, T0 + DROP)).toEqual(first);
    expect(room.players[1].standIn).toBeUndefined();
  });
  it('does not reopen an ended room', () => {
    const { room, host } = table('quiz', 1);
    join(room);
    host({ action: 'end' });
    expect(() => join(room)).toThrow('no longer accepting');
  });
});

describe('taking a seat back mid-match', () => {
  const ask = (
    room: Parameters<typeof mutate>[0],
    joinId?: string,
    now = T0 + DROP,
    extra: Record<string, unknown> = {},
  ) => mutate(room, { action: 'join', name: ' p1 ', joinId, ...extra }, '', now);
  const claims = (room: Parameters<typeof mutate>[0], now = T0 + DROP) =>
    snapshot(room, now, room.hostToken).claims;
  // P1's phone has gone quiet; P0's still polls.
  function match(seats = 2) {
    const t = table('quiz', seats);
    t.host({ action: 'start' });
    t.room.players[1].score = 700;
    t.ping(0, T0 + DROP);
    return t;
  }

  it('waits for the host, then keeps the seat and score on the new phone', () => {
    const { room, host, seats } = match();
    expect(ask(room, 'new-phone-secret-1')).toMatchObject({ pending: true, extras: {} });
    const [claim] = claims(room);
    expect(claim.seat).toBe(seats[1].id);
    for (const token of ['', seats[0].token]) expect(snapshot(room, T0 + DROP, token).claims).toEqual([]);
    host({ action: 'claim', id: claim.id, accept: true }, T0 + DROP);
    const { extras } = ask(room, 'new-phone-secret-1');
    expect(extras.playerId).toBe(seats[1].id);
    expect(room.players[1].score).toBe(700);
    expect(() => mutate(room, { action: 'view' }, seats[1].token, T0 + DROP)).toThrow('Join this room');
    mutate(room, { action: 'view' }, extras.playerToken, T0 + DROP);
  });

  it('tells a phone the host turned down, until it asks again with a new id', () => {
    const { room, host } = match();
    ask(room, 'new-phone-secret-1');
    host({ action: 'claim', id: claims(room)[0].id, accept: false }, T0 + DROP);
    expect(claims(room)).toEqual([]);
    expect(() => ask(room, 'new-phone-secret-1')).toThrow('The host did not give you this seat.');
    expect(ask(room, 'new-phone-secret-2').pending).toBe(true);
  });

  it('gives the seat to one phone and turns the others down', () => {
    const { room, host, seats } = match();
    ask(room, 'first-phone-secret');
    ask(room, 'second-phone-secret');
    const [first, second] = claims(room);
    expect(second.seat).toBe(first.seat);
    host({ action: 'claim', id: first.id, accept: true }, T0 + DROP);
    expect(ask(room, 'first-phone-secret').extras.playerId).toBe(seats[1].id);
    expect(() => ask(room, 'second-phone-secret')).toThrow('The host did not give you this seat.');
  });

  it('forgets a request its phone stopped repeating, or whose seat was removed', () => {
    const { room, host, seats } = match();
    ask(room, 'new-phone-secret-1');
    const [claim] = claims(room);
    const later = T0 + DROP + 25_000;
    expect(claims(room, later)).toEqual([]);
    expect(() => host({ action: 'claim', id: claim.id, accept: true }, later)).toThrow(
      'That request has gone.',
    );
    ask(room, 'new-phone-secret-1');
    host({ action: 'kick', playerId: seats[1].id }, T0 + DROP);
    expect(room.claims).toEqual([]);
  });

  it('cannot hand over a seat whose own phone is back', () => {
    const { room, host, ping } = match();
    ask(room, 'new-phone-secret-1');
    const [claim] = claims(room);
    ping(1, T0 + DROP + 1000);
    expect(claims(room, T0 + DROP + 1000)).toEqual([]);
    expect(() => host({ action: 'claim', id: claim.id, accept: true }, T0 + DROP + 1000)).toThrow(
      'That request has gone.',
    );
  });

  it('keeps the seat a join id asks for, even when the phone changes its mind', () => {
    const { room, host, seats } = match(3);
    ask(room, 'new-phone-secret-1');
    ask(room, 'new-phone-secret-1', T0 + DROP, { name: 'P2' });
    // The request for P1 is replaced, not kept beside the new one.
    const [claim, ...rest] = claims(room);
    expect(rest).toEqual([]);
    expect(claim.seat).toBe(seats[2].id);
    host({ action: 'claim', id: claim.id, accept: true }, T0 + DROP);
    const { extras } = ask(room, 'new-phone-secret-1', T0 + DROP, { name: 'P2' });
    expect(extras.playerId).toBe(seats[2].id);
    // Asking for P1 again with that id is a new request, not P1's seat.
    expect(ask(room, 'new-phone-secret-1').pending).toBe(true);
  });

  it('shows the request for a seat even when the earlier seat came back first', () => {
    const { room, ping, seats } = match(3);
    ask(room, 'new-phone-secret-1');
    ping(1, T0 + DROP + 1000);
    ask(room, 'new-phone-secret-1', T0 + DROP + 1000, { name: 'P2' });
    const [claim, ...rest] = claims(room, T0 + DROP + 1000);
    expect(rest).toEqual([]);
    expect(claim.seat).toBe(seats[2].id);
  });

  it('does not hand over a seat that is no longer quiet', () => {
    const { room, host, ping, seats } = match();
    ask(room, 'new-phone-secret-1');
    const [claim] = claims(room);
    ping(1, T0 + DROP + 1000);
    expect(() => host({ action: 'claim', id: claim.id, accept: true }, T0 + DROP + 1000)).toThrow(
      'That request has gone.',
    );
    expect(room.players[1].token).toBe(seats[1].token);
    expect(room.players[1].joinId).not.toBe('new-phone-secret-1');
  });

  it('lets the owner through when three phones filled the seat, dropping the oldest', () => {
    const { room } = match();
    for (const n of [1, 2, 3]) ask(room, 'new-phone-secret-' + n);
    expect(ask(room, 'owner-new-phone-1').pending).toBe(true);
    expect(room.claims!.map((c) => c.joinId)).toEqual([
      'new-phone-secret-2',
      'new-phone-secret-3',
      'owner-new-phone-1',
    ]);
    expect(claims(room)).toHaveLength(3);
  });

  it('counts refusals toward a per-seat limit', () => {
    const { room, host } = match();
    for (const n of [1, 2, 3]) {
      ask(room, 'new-phone-secret-' + n);
      host({ action: 'claim', id: claims(room)[0].id, accept: false }, T0 + DROP);
    }
    expect(() => ask(room, 'new-phone-secret-4')).toThrow('Too many phones are asking for this seat.');
    // Refusals expire, and then the seat can be asked for again.
    expect(ask(room, 'new-phone-secret-4', T0 + DROP + 25_000).pending).toBe(true);
  });

  it('caps what a room stores, however many phones ask and are refused', () => {
    const { room, host } = match(3);
    for (let n = 0; n < 200; n++) {
      try {
        ask(room, 'spam-phone-secret-' + n, T0 + DROP, { name: n % 2 ? 'P1' : 'P2' });
      } catch {
        continue; // a seat with too many refusals turns the phone away
      }
      const open = room.claims!.find((c) => !c.refused && c.joinId === 'spam-phone-secret-' + n);
      if (open) host({ action: 'claim', id: open.id, accept: false }, T0 + DROP);
    }
    expect(room.claims!.length).toBeLessThanOrEqual(12);
  });

  it('needs the phone to send a join id', () => {
    const { room } = match();
    expect(() => ask(room)).toThrow('Ask the host to let you back in.');
  });

  it('is dropped when the room goes back to the lobby, where a quiet seat is taken back at once', () => {
    const { room, host, seats } = match();
    ask(room, 'new-phone-secret-1');
    host({ action: 'lobby' }, T0 + DROP);
    expect(room.claims).toBeUndefined();
    expect(ask(room, 'new-phone-secret-1').extras.playerId).toBe(seats[1].id);
  });
});

describe('dropped players', () => {
  it('cannot have their seat taken while connected', () => {
    const { room, host } = table('quiz', 2);
    host({ action: 'start' });
    expect(() => mutate(room, { action: 'join', name: 'P1' }, '', T0)).toThrow('no longer accepting');
  });
  it('send the room back to the lobby when the last one is removed', () => {
    const { room, host, seats } = table('quiz', 1);
    host({ action: 'start' });
    host({ action: 'kick', playerId: seats[0].id }, T0 + DROP);
    expect(room.phase).toBe('lobby');
  });

  function island() {
    const t = table('settlers', 2);
    t.host({ action: 'start' });
    // Make it the second player's turn, then let them drop.
    t.room.island!.turn = 1;
    t.ping(0, T0 + DROP);
    return t;
  }
  it('get a stand-in bot that plays until they return', () => {
    const { room, host, play, seats } = island(),
      now = T0 + DROP;
    host({ action: 'view' }, now + 5000);
    expect(room.island!.revision).toBe(0);
    host({ action: 'standIn', playerId: seats[1].id }, now);
    host({ action: 'view' }, now + 1200);
    expect(room.island!.revision).toBe(1);
    play(1, { action: 'view' }, now + 1300);
    expect(room.players[1].standIn).toBeUndefined();
    host({ action: 'view' }, now + 9000);
    expect(room.island!.revision).toBe(1);
  });
  it('are not replaced while connected, and not removed from an island', () => {
    const { host, seats } = island(),
      now = T0 + DROP;
    expect(() => host({ action: 'standIn', playerId: seats[0].id }, now)).toThrow('disconnected');
    expect(() => host({ action: 'kick', playerId: seats[1].id }, now)).toThrow('bot take over');
  });
  it('do not block a rematch when a bot stands in', () => {
    const { room, host, seats } = island(),
      now = T0 + DROP;
    expect(() => host({ action: 'restart' }, now)).toThrow('connected and ready');
    host({ action: 'standIn', playerId: seats[1].id }, now);
    host({ action: 'restart' }, now);
    expect(room.phase).toBe('playing');
    host({ action: 'lobby' }, now);
    expect(room.players[1].standIn).toBeUndefined();
  });
});
