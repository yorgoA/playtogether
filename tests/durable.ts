import type { RoomSnapshot } from '../lib/contract';

// An in-memory stand-in for a Durable Object's state, enough to run `RoomObject` in Node. It proves the room's
// logic, not workerd itself: no input gates, no hibernation, no real alarms.

export class FakeSocket {
  sent: Record<string, unknown>[] = [];
  closed?: number;
  private attachment: unknown = null;
  send(message: string) {
    this.sent.push(JSON.parse(message));
  }
  close(code = 1000) {
    this.closed = code;
  }
  serializeAttachment(value: unknown) {
    this.attachment = structuredClone(value);
  }
  deserializeAttachment() {
    return this.attachment;
  }
  last() {
    return this.sent.at(-1) as { room?: RoomSnapshot; error?: string } | undefined;
  }
}

export function fakeState() {
  const store = new Map<string, unknown>();
  const sockets: FakeSocket[] = [];
  let alarm: number | null = null;
  const state = {
    storage: {
      async get(key: string) {
        return structuredClone(store.get(key));
      },
      async put(entries: Record<string, unknown>) {
        for (const [key, value] of Object.entries(entries)) store.set(key, structuredClone(value));
      },
      async deleteAll() {
        store.clear();
      },
      async setAlarm(at: number) {
        alarm = at;
      },
      async getAlarm() {
        return alarm;
      },
    },
    acceptWebSocket(ws: FakeSocket) {
      sockets.push(ws);
    },
    getWebSockets() {
      return sockets.filter((ws) => ws.closed === undefined);
    },
  };
  return { state, store, alarm: () => alarm };
}
