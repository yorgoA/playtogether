import { describe, expect, it, vi, afterEach } from 'vitest';
import { mutate, snapshot } from '../lib/server/session';
import { DROP, table } from './helpers';

afterEach(() => vi.restoreAllMocks());

function duel(count = 4, rounds = 2) {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
  const t = table('reaction', count, rounds);
  t.host({ action: 'start' });
  const { room } = t;
  const shoot = (i: number, reactionMs: unknown, at = 600) =>
    t.play(i, { action: 'input', round: room.round, draw: room.duel!.draw, reactionMs }, room.signalAt + at);
  const early = (i: number) =>
    t.play(i, { action: 'input', round: room.round, draw: room.duel!.draw, early: true }, room.started + 100);
  const next = () => t.host({ action: 'view' }, room.deadline);
  const alive = () => room.duel!.alive.map((id) => t.seats.findIndex((s) => s.id === id));
  return { ...t, shoot, early, next, alive };
}

describe('standoff', () => {
  it('needs two players', () => {
    const { host } = table('reaction', 1);
    expect(() => host({ action: 'start' })).toThrow('two to eight');
  });
  it('drops the slowest each draw until one is left, then starts a new round', () => {
    const { room, shoot, next, alive, seats } = duel();
    [300, 200, 400, 250].forEach((ms, i) => shoot(i, ms));
    expect(room.revealing).toBe(true);
    expect(room.duel!.fallen).toEqual([{ id: seats[2].id, by: seats[1].id, why: 'slow' }]);
    next();
    expect(alive()).toEqual([0, 1, 3]);
    [300, 200].forEach((ms, i) => shoot(i, ms));
    shoot(3, 250);
    next();
    shoot(1, 350);
    shoot(3, 250);
    expect(room.duel).toMatchObject({ winner: seats[3].id, over: true, wins: { [seats[3].id]: 1 } });
    expect(room.players.map((p) => p.score)).toEqual([100, 200, 0, 800]);
    next();
    expect(room.round).toBe(2);
    expect(alive()).toEqual([0, 1, 2, 3]);
  });
  it('ends after the last round', () => {
    const { room, shoot, next } = duel(2, 1);
    shoot(0, 200);
    shoot(1, 300);
    next();
    expect(room.phase).toBe('results');
  });
  it('drops everyone who fouls, and spares the slowest then', () => {
    const { room, shoot, early, next, alive } = duel();
    early(0);
    shoot(1, 200);
    shoot(2, 500);
    next(); // Player 3 never draws.
    expect(room.duel!.fallen.map((f) => f.why)).toEqual(['early', 'silent']);
    expect(alive()).toEqual([1, 2]);
  });
  it('draws again when nobody would survive, and calls the round off after three times', () => {
    const { room, early, next, alive, shoot } = duel(2);
    shoot(0, 250);
    shoot(1, 250);
    expect(alive()).toEqual([0, 1]);
    for (let i = 0; i < 2; i++) {
      next();
      early(0);
      early(1);
    }
    expect(room.duel).toMatchObject({ over: true, winner: null });
    next();
    expect(room.round).toBe(2);
  });
  it('refuses a late shot from an earlier draw, and shots from the fallen', () => {
    const { room, play, shoot, next } = duel(3);
    [200, 300, 400].forEach((ms, i) => shoot(i, ms));
    next();
    expect(() => play(0, { action: 'input', round: 1, draw: 1, early: true }, room.started)).toThrow('over');
    expect(() => shoot(2, 200)).toThrow('out of this round');
  });
  it('hides the signal and the other shots until it is time', () => {
    const { room, seats, shoot } = duel();
    expect(snapshot(room, room.signalAt - 1801).signalAt).toBeNull();
    expect(snapshot(room, room.signalAt - 1800).signalAt).toBe(room.signalAt);
    shoot(0, 200);
    const seen = (token: string) =>
      snapshot(room, room.signalAt + 601, token).players.find((p) => p.id === seats[0].id)!.reactionMs;
    expect(seen(seats[0].token)).toBe(200);
    expect(seen(seats[1].token)).toBeUndefined();
    expect(seen(room.hostToken)).toBeUndefined();
  });
  it.each([
    [79, 300],
    [200, -1],
  ])('takes %i ms, %i ms after the signal, as a misfire', (ms, at) => {
    const { room, shoot } = duel();
    shoot(0, ms, at);
    expect(room.players[0]).toMatchObject({ early: true, answered: true });
  });
  it('limits how much of a late shot counts as network delay', () => {
    const { room, shoot } = duel();
    shoot(0, 100, 4000);
    expect(room.players[0].reactionMs).toBe(1000);
  });
  it.each([undefined, '200', NaN, Infinity])('rejects a reaction time of %s', (value) => {
    expect(() => duel().shoot(0, value)).toThrow('Invalid reaction');
  });
  it('picks a fresh signal after a pause', () => {
    const { room, host } = duel();
    const signal = room.signalAt;
    host({ action: 'pause' }, signal - 100);
    host({ action: 'resume' }, signal + 5000);
    expect(room.signalAt).toBe(signal + 5000 + 3500);
  });
  it('goes on, or ends the round, when a dropped player is removed', () => {
    const { room, host, shoot, seats, alive } = duel(3);
    shoot(0, 200);
    shoot(1, 300);
    room.players[2].lastSeen = room.started - DROP;
    mutate(room, { action: 'kick', playerId: seats[2].id }, room.hostToken, room.signalAt + 700);
    expect(alive()).toEqual([0]);
    expect(room.duel!.winner).toBe(seats[0].id);
    room.players[1].lastSeen = room.started - DROP;
    host({ action: 'kick', playerId: seats[1].id }, room.signalAt + 800);
    expect(room.phase).toBe('results');
  });
});
