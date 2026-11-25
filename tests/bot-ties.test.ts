import { describe, expect, it } from 'vitest';
import { table } from './helpers';

describe('ties between bots', () => {
  function bots(game: string) {
    const t = table(game, 1, 1);
    t.host({ action: 'addBot', difficulty: 'easy' });
    t.host({ action: 'addBot', difficulty: 'easy' });
    t.host({ action: 'start' });
    return t;
  }

  it('ends a quiz as a shared win when only bots are tied for first', () => {
    const t = bots('quiz');
    const [human, one, two] = t.room.players;
    human.score = -100;
    one.score = two.score = 300;
    t.room.round = t.room.rounds;
    t.room.quiz!.stage = 'reveal';
    t.room.revealing = true;
    human.lastSeen = t.room.deadline;
    t.host({ action: 'view' }, t.room.deadline);
    expect(t.room.phase).toBe('results');
    expect(t.room.tiebreaks).toBeUndefined();
  });

  it('still plays a tie-break when a person is tied with a bot', () => {
    const t = bots('quiz');
    const [human, one] = t.room.players;
    human.score = one.score = 300;
    t.room.players[2].score = 0;
    t.room.round = t.room.rounds;
    t.room.quiz!.stage = 'reveal';
    t.room.revealing = true;
    human.lastSeen = t.room.deadline;
    t.host({ action: 'view' }, t.room.deadline);
    expect(t.room).toMatchObject({ phase: 'playing', tiebreaks: 1 });
  });
});
