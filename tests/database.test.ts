import { getTableConfig } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import * as schema from '../db/schema';
import { useDatabase } from './database';

describe('migrations', () => {
  it('create exactly the tables, columns and indexes of the Drizzle schema', () => {
    const sqlite = useDatabase();
    for (const table of Object.values(schema)) {
      const config = getTableConfig(table);
      const columns = sqlite.prepare(`PRAGMA table_info(${config.name})`).all() as { name: string }[];
      expect(columns.map((c) => c.name).sort(), config.name).toEqual(
        config.columns.map((c) => c.name).sort(),
      );
      const indexes = (sqlite.prepare(`PRAGMA index_list(${config.name})`).all() as { name: string }[]).map(
        (i) => i.name,
      );
      for (const index of config.indexes) expect(indexes).toContain(index.config.name);
    }
    const tables = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all();
    expect(tables).toHaveLength(Object.keys(schema).length);
  });
  it('treat profile names as case-insensitive and unique', () => {
    const sqlite = useDatabase();
    const add = sqlite.prepare("INSERT INTO profiles VALUES (?, ?, '2000-01-01', 'x', 's', 'h')");
    add.run('1', 'Alex');
    expect(() => add.run('2', 'ALEX')).toThrow(/UNIQUE/);
  });
  it('refuse a session for a profile that does not exist', () => {
    const sqlite = useDatabase();
    expect(() => sqlite.prepare("INSERT INTO profile_sessions VALUES ('t', 'missing', 1)").run()).toThrow(
      /FOREIGN KEY/,
    );
  });
});
