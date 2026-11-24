import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { env } from 'cloudflare:workers';

const migrations = join(import.meta.dirname, '..', 'drizzle');

// A small D1 look-alike over SQLite, covering the calls the server code makes.
function d1(sqlite: DatabaseSync) {
  const statement = (sql: string, params: unknown[] = []) => ({
    bind: (...values: unknown[]) => statement(sql, values),
    run: async () => ({ meta: { changes: Number(sqlite.prepare(sql).run(...(params as never[])).changes) } }),
    first: async () => sqlite.prepare(sql).get(...(params as never[])) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...(params as never[])) }),
  });
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (list: ReturnType<typeof statement>[]) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const one of list) results.push(await one.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

// Applies every migration, in order, to a fresh in-memory database and points the server at it.
export function useDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  for (const file of readdirSync(migrations)
    .filter((name) => name.endsWith('.sql'))
    .sort())
    sqlite.exec(readFileSync(join(migrations, file), 'utf8'));
  env.DB = d1(sqlite) as unknown as D1Database;
  return sqlite;
}
