import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const rooms = sqliteTable('rooms', {
  code: text('code').primaryKey(),
  version: integer('version').notNull(),
  state: text('state').notNull(),
  expires: integer('expires').notNull(),
});
