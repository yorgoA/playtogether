import { describe, expect, it } from 'vitest';
import { RoomSnapshot } from '../lib/contract';
import { POST as account } from '../app/api/profile/route';
import { POST as roomPost } from '../app/api/rooms/[code]/route';
import { POST as createRoute } from '../app/api/rooms/route';
import { raceGraceMs } from '../lib/server/kings';
import { mutate, snapshot } from '../lib/server/session';
import { cookieFrom, json, post } from './api-helpers';
import { useDatabase } from './database';
import { T0, table } from './helpers';

function match(players = 3) {
  const t = table('kings', players, 1);
  t.host({ action: 'start' });
  const board = t.room.kings!;
  const send = (seat: number, move: string, more = {}) =>
    t.play(seat, { action: 'kings', move, seq: board.seq, ...more });
  // Puts the wanted card on top so each rule can be tested.
  const draw = (seat: number, card: string) => {
    const slot = board.left.indexOf(true);
    const at = board.deck.findIndex((c, i) => board.left[i] && c === card);
    [board.deck[slot], board.deck[at]] = [board.deck[at], board.deck[slot]];
    send(seat, 'draw', { slot });
  };
  const id = (seat: number) => t.seats[seat].id;
  const scores = () => t.room.players.map((p) => p.score);
  return { ...t, board, send, draw, id, scores };
}

describe('Kings Cup', () => {
  it('needs two players and never sends the deck', () => {
    const solo = table('kings', 1, 1);
    expect(() => solo.host({ action: 'start' })).toThrow('two to eight');
    const { room, draw } = match();
    draw(0, 'QS');
    const view = snapshot(room, T0, room.hostToken);
    expect(RoomSnapshot.parse(view).kings?.card).toBe('QS');
    expect(JSON.stringify(view).match(/"[A2-9TJQK][SHDC]"/g)).toEqual(['"QS"']);
  });

  it('keeps turns in order and refuses stale or taken cards', () => {
    const { board, send, draw, play } = match();
    expect(() => send(1, 'draw', { slot: 0 })).toThrow('not your turn');
    draw(0, '3S');
    expect(() => send(0, 'draw', { slot: 5 })).toThrow('not available');
    expect(() => play(0, { action: 'kings', move: 'done', seq: board.seq - 1 })).toThrow('moved on');
    send(0, 'done');
    expect(() => send(1, 'draw', { slot: 0 })).toThrow('already gone');
    draw(1, 'AS');
    send(1, 'done');
    draw(2, '5S');
  });

  it('pours for every kind of card', () => {
    const { room, board, send, draw, id, scores } = match();
    draw(0, 'AS');
    expect(scores()).toEqual([-1, -1, -1]);
    send(0, 'done');
    draw(1, '2S');
    expect(() => send(1, 'pick', { target: id(1) })).toThrow('another player');
    send(1, 'pick', { target: id(2) });
    send(1, 'done');
    expect(scores()).toEqual([-1, -1, -2]);
    draw(2, '7S');
    send(2, 'tap');
    send(2, 'tap');
    expect(board.phase).toBe('race');
    send(0, 'tap');
    expect(board.phase).toBe('race');
    mutate(room, { action: 'view' }, room.hostToken, T0 + raceGraceMs);
    expect(board.event?.drinkers).toEqual([id(1)]);
    send(2, 'done');
    draw(0, 'JS');
    send(1, 'drank');
    send(1, 'drank');
    expect(scores()).toEqual([-1, -3, -2]);
    send(0, 'done');
    draw(1, 'TS');
    send(1, 'pick', { target: id(1) });
    expect(scores()).toEqual([-1, -4, -2]);
  });

  function race(players = 3) {
    const t = match(players);
    t.draw(0, '4S');
    const tap = (seat: number, now: number, ms?: number) =>
      t.play(
        seat,
        { action: 'kings', move: 'tap', seq: t.board.seq, ...(ms === undefined ? {} : { ms }) },
        now,
      );
    const view = (now: number) => t.host({ action: 'view' }, now);
    return { ...t, tap, view };
  }
  it('gives the race to the slowest tap, whatever order the taps arrive in', () => {
    const { board, tap, id, scores } = race();
    tap(0, T0 + 500, 480);
    tap(1, T0 + 700, 690);
    tap(2, T0 + 2000, 400);
    expect(board.phase).toBe('open');
    expect(board.event?.drinkers).toEqual([id(1)]);
    expect(scores()).toEqual([0, -1, 0]);
  });
  it('counts the first tap only, and makes a tie drink together', () => {
    const { tap, scores } = race();
    tap(0, T0 + 500, 400);
    tap(0, T0 + 600, 50);
    tap(1, T0 + 700, 600);
    tap(2, T0 + 800, 600);
    expect(scores()).toEqual([0, -1, -1]);
  });
  it('does not believe a tap faster than its delay allows, or slower than the race itself', () => {
    const { board, tap } = race();
    tap(0, T0 + 5000, 10);
    tap(1, T0 + 5000, 99_999);
    tap(2, T0 + 5000);
    expect(Object.values(board.times!)).toEqual([2000, 5000, 5000]);
  });
  it('waits for the last phone, then makes it drink', () => {
    const { board, tap, view, scores, id } = race();
    tap(0, T0 + 500, 400);
    view(T0 + 60_000);
    expect(board.phase).toBe('race');
    tap(1, T0 + 900, 800);
    view(T0 + 900 + raceGraceMs - 1);
    expect(board.phase).toBe('race');
    view(T0 + 900 + raceGraceMs);
    view(T0 + 900 + raceGraceMs + 5000);
    expect(board.event?.drinkers).toEqual([id(2)]);
    expect(scores()).toEqual([0, 0, -1]);
  });
  it('stops the race clock while paused', () => {
    const { board, tap, host, view } = race();
    tap(0, T0 + 500, 400);
    tap(1, T0 + 600, 500);
    host({ action: 'pause' }, T0 + 700);
    view(T0 + 100_000);
    expect(board.phase).toBe('race');
    host({ action: 'resume' }, T0 + 100_000);
    tap(2, T0 + 100_200, 300);
    expect(board.times).toEqual(expect.objectContaining({ [board.order[2]]: 300 }));
  });
  it('starts the next race fresh', () => {
    const { board, tap, send, draw } = race();
    for (const seat of [0, 1, 2]) tap(seat, T0 + 500, 100 * (seat + 1));
    send(0, 'done');
    draw(1, '7S');
    expect(board).toMatchObject({ phase: 'race', tapped: [], raceUntil: undefined, times: undefined });
  });
  it('never sends race times or presses', () => {
    const { room, tap } = race();
    tap(0, T0 + 500, 431.4375);
    const json = JSON.stringify(snapshot(room, T0, room.hostToken));
    for (const secret of ['times', 'raceAt', 'raceUntil', 'presses', '431.4375'])
      expect(json).not.toContain(secret);
  });
  it('counts a repeated catch once, and a new one again', () => {
    const { send, draw, id, scores, board, play } = match();
    draw(0, 'QS');
    const press = 'one-press-1';
    const seq = board.seq;
    send(0, 'catch', { target: id(1), press });
    send(0, 'catch', { target: id(1), press });
    send(0, 'done');
    // The repeat may arrive after the table has moved on.
    play(0, { action: 'kings', move: 'catch', seq, target: id(1), press });
    expect(scores()).toEqual([0, -1, 0]);
    send(0, 'catch', { target: id(1), press: 'another-press' });
    expect(scores()).toEqual([0, -2, 0]);
  });

  it('makes mates drink together and lets the question master catch people', () => {
    const { send, draw, id, scores } = match();
    draw(0, '8S');
    send(0, 'pick', { target: id(1) });
    send(0, 'done');
    draw(1, 'QS');
    expect(() => send(0, 'catch', { target: id(2) })).toThrow('question master');
    send(1, 'catch', { target: id(0) });
    expect(scores()).toEqual([-1, -1, 0]);
    send(1, 'done');
    draw(2, 'JS');
    send(0, 'drank');
    send(1, 'drank'); // Already drank with their mate.
    expect(scores()).toEqual([-2, -2, 0]);
  });

  it('collects house rules and ends when the fourth king drinks the cup', () => {
    const { room, board, send, draw, host, scores } = match(2);
    for (const [i, king] of ['KS', 'KH', 'KD'].entries()) {
      draw(i % 2, king);
      expect(() => send(i % 2, 'done')).toThrow('not available');
      send(i % 2, 'rule', { text: ' No first names ' });
      send(i % 2, 'done');
    }
    expect(board.rules.map((r) => r.text)).toEqual(Array(3).fill('No first names'));
    draw(1, 'KC');
    expect(scores()).toEqual([0, -4]);
    expect(room.phase).toBe('playing');
    send(1, 'done');
    expect(room.phase).toBe('results');
    host({ action: 'restart' });
    expect(room.kings?.kings).toBe(0);
  });

  it('lets the host skip a turn and drops players who leave', () => {
    const { room, board, host, seats, id } = match(3);
    expect(() => host({ action: 'kingsNext', seq: 99 })).toThrow('moved on');
    host({ action: 'kingsNext', seq: board.seq });
    expect(board.order[board.turn]).toBe(id(1));
    board.mates = [[id(0), id(1)]];
    const later = T0 + 60_000;
    for (const seat of [0, 2]) mutate(room, { action: 'view' }, seats[seat].token, later);
    mutate(room, { action: 'kick', playerId: id(1) }, room.hostToken, later);
    expect(board.order).toEqual([id(0), id(2)]);
    expect(board.order[board.turn]).toBe(id(2));
    expect(board.mates).toEqual([]);
  });
});

describe('drinking game rooms', () => {
  it('open for adult profiles only', async () => {
    useDatabase();
    const register = (name: string, birthday: string) =>
      account(post('/api/profile', { action: 'register', name, password: 'correct horse', birthday }));
    const grown = cookieFrom(await register('Sam', '1990-05-17'));
    const child = cookieFrom(await register('Kid', '2015-03-01'));
    const open = (game: string, cookie = '') => createRoute(post('/api/rooms', { game }, { cookie }));
    for (const game of ['kings', 'pyramid']) {
      expect((await open(game)).status).toBe(403);
      expect((await open(game, child)).status).toBe(403);
      expect((await open(game, grown)).status).toBe(201);
    }
    const quiz = await json(await open('quiz'));
    const configure = (cookie: string) =>
      roomPost(
        post(
          '/api/rooms/' + quiz.code,
          { action: 'configure', game: 'kings' },
          { authorization: 'Bearer ' + quiz.hostToken, cookie },
        ),
        { params: Promise.resolve({ code: quiz.code }) },
      );
    expect((await configure(child)).status).toBe(403);
    expect((await configure(grown)).status).toBe(200);
  });
});
