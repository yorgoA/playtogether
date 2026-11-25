// Stands in for the `cloudflare:workers` module in tests. Tests set `env.DB` with `useDatabase()`.
export const env: { DB?: unknown } = {};
// The base class a Durable Object extends. Tests build one with `fakeState()` from `tests/durable.ts`.
export class DurableObject {
  constructor(
    protected ctx: unknown,
    protected env: unknown,
  ) {}
}
