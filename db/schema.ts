import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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

// Achievements belong to the account: each is earned once, in the game named, when a match ends.
export const achievements = sqliteTable(
  'achievements',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id),
    achievementId: text('achievement_id').notNull(),
    game: text('game').notNull(),
    earnedAt: integer('earned_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.achievementId] })],
);

export const favourites = sqliteTable(
  'favourites',
  {
    profileId: text('profile_id')
      .notNull()
      .references(() => profiles.id),
    game: text('game').notNull(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.game] })],
);

// Counts attempts per key (a name or an address) until `resetAt`, to slow down guessing.
export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    resetAt: integer('reset_at').notNull(),
  },
  (t) => [index('rate_limits_reset_idx').on(t.resetAt)],
);
