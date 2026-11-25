import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as roomRoute, POST as roomPost } from '../app/api/rooms/[code]/route';
import { POST as createRoute } from '../app/api/rooms/route';
import { get, json, post } from './api-helpers';
import { useDatabase } from './database';
import { T0 } from './helpers';

// Plays through the API on SQLite: the room is read back from storage before every request, so a bot
// plan that was never saved with it would be rolled again.
let sqlite: ReturnType<typeof useDatabase>;
beforeEach(() => {
  sqlite = useDatabase();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(T0);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const ctx = (code: string) => ({ params: Promise.resolve({ code }) });
const bearer = (token: string) => ({ authorization: 'Bearer ' + token });
const send = async (code: string, body: unknown, token: string) =>
  json(await roomPost(post('/api/rooms/' + code, body, bearer(token)), ctx(code)));
const poll = (code: string, token: string, at: number) => {
  vi.setSystemTime(at);
  return roomRoute(get('/api/rooms/' + code, bearer(token)), ctx(code));
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const stored = (): any =>
  JSON.parse((sqlite.prepare('SELECT state FROM rooms').get() as { state: string }).state);

async function start(game: string, level: string) {
  const created = await json(await createRoute(post('/api/rooms', { game })));
  if (!created.code) throw new Error(JSON.stringify(created));
  const joined = await send(created.code, { action: 'join', name: 'Ana' }, '');
  await send(created.code, { action: 'ready', ready: true }, joined.playerToken);
  await send(created.code, { action: 'addBot', difficulty: level }, created.hostToken);
  return {
    code: created.code as string,
    phone: joined.playerToken as string,
    host: created.hostToken as string,
  };
}

describe('bot plans in stored rooms', () => {
  it('keeps a duel bot on the same reaction across requests until it shoots', async () => {
    const { code, phone, host } = await start('reaction', 'normal');
    await send(code, { action: 'start' }, host);
    const { aims } = stored().duel;
    const [botId] = Object.keys(aims);
    expect(aims[botId]).toHaveProperty('ms');
    const { signalAt } = stored();
    for (let i = 1; i <= 6; i++) {
      await poll(code, phone, T0 + i * 200);
      expect(stored().duel.aims).toEqual(aims);
    }
    const bot = () => stored().players.find((p: { id: string }) => p.id === botId);
    await poll(code, phone, signalAt + aims[botId].ms - 1);
    expect(bot().answered).toBe(false);
    await poll(code, phone, signalAt + aims[botId].ms);
    expect(bot().reactionMs).toBe(aims[botId].ms);
  });

  it('keeps a planned early shot early', async () => {
    // First roll below the easy bot's 10% makes the plan `early`.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { code, phone, host } = await start('reaction', 'easy');
    await send(code, { action: 'start' }, host);
    vi.restoreAllMocks();
    const { aims } = stored().duel;
    const [botId] = Object.keys(aims);
    expect(aims[botId]).toEqual({ early: true });
    const { signalAt } = stored();
    for (let i = 1; i <= 5; i++) {
      await poll(code, phone, T0 + i * 100);
      expect(stored().duel.aims[botId]).toEqual({ early: true });
    }
    await poll(code, phone, signalAt - 400);
    const bot = stored().players.find((p: { id: string }) => p.id === botId);
    expect(bot).toMatchObject({ answered: true, early: true });
  });

  it('keeps a quiz bot on the same plan across requests until it answers', async () => {
    const { code, phone, host } = await start('quiz', 'hard');
    await send(code, { action: 'start' }, host);
    let at = T0;
    while (stored().quiz.stage !== 'question') {
      at = stored().deadline;
      await poll(code, phone, at);
    }
    const { aims } = stored().quiz;
    const [botId] = Object.keys(aims);
    expect(aims[botId]).toEqual({ at: expect.any(Number), right: expect.any(Boolean) });
    const { started } = stored();
    for (let i = 1; i <= 5; i++) {
      await poll(code, phone, started + i);
      expect(stored().quiz.aims).toEqual(aims);
    }
    await poll(code, phone, started + aims[botId].at);
    expect(stored().quiz.picks[botId]).toBeDefined();
  });
});
