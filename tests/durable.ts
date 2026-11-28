import type { RoomSnapshot } from '../lib/contract';
import { RoomObject } from '../lib/server/room-object';

// An in-memory stand-in for a Durable Object's state, enough to run `RoomObject` in Node. It proves the room's
// logic, not workerd itself: no input gates, no hibernation, no real alarms.

// The runtime's ping/pong pair, which Node does not have.
if (!('WebSocketRequestResponsePair' in globalThis))
  Object.assign(globalThis, {
    WebSocketRequestResponsePair: class {
      constructor(
        readonly request: string,
        readonly response: string,
      ) {}
    },
  });

export class FakeSocket {
  sent: Record<string, unknown>[] = [];
  closed?: number;
  // When the runtime last answered this socket's `ping`.
  pongAt?: number;
  get readyState() {
    return this.closed === undefined ? WebSocket.OPEN : WebSocket.CLOSING;
  }
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
    setWebSocketAutoResponse() {},
    getWebSocketAutoResponseTimestamp(ws: FakeSocket) {
      return ws.pongAt === undefined ? null : new Date(ws.pongAt);
    },
  };
  return { state, store, alarm: () => alarm };
}

// Stands in for `env.ROOMS`: one room object per name, each with its own in-memory state.
export function fakeRooms() {
  const rooms = new Map<string, RoomObject>();
  return {
    idFromName: (name: string) => name,
    get(id: string) {
      if (!rooms.has(id)) rooms.set(id, new RoomObject(fakeState().state as never, {} as never));
      return rooms.get(id)!;
    },
  };
}
