import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const rooms = sqliteTable(
  'rooms',
  {
    code: text('code').primaryKey(),
    version: integer('version').notNull(),
    state: text('state').notNull(),
    expires: integer('expires').notNull(),
  },
  (t) => [index('rooms_expires_idx').on(t.expires)],
);

// The migration also makes `name` case-insensitive (COLLATE NOCASE), which Drizzle cannot express.
export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  birthday: text('birthday').notNull(),
  avatar: text('avatar').notNull(),
  salt: text('salt').notNull(),
  passwordHash: text('password_hash').notNull(),
});

export const profileSessions = sqliteTable(
  'profile_sessions',
  {
    token: text('token').primaryKey(),
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id),
    expires: integer('expires').notNull(),
  },
  (t) => [index('profile_sessions_expires_idx').on(t.expires)],
);
