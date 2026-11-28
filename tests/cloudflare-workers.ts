// Stands in for the `cloudflare:workers` module in tests. Tests set `env.DB` with `useDatabase()`, and
// `env.ROOMS` with `fakeRooms()` to run rooms as Durable Objects.
export const env: { DB?: unknown; ROOMS?: unknown; ROOM_HOST?: string } = {};
// The base class a Durable Object extends. Tests build one with `fakeState()` from `tests/durable.ts`.
export class DurableObject {
  constructor(
    protected ctx: unknown,
    protected env: unknown,
  ) {}
}
