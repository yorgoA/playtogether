import { z } from 'zod';
import { gameIds } from './rooms';

// The profile API (/api/profile). Sessions travel in an HttpOnly cookie, never in a body.

const name = z.string().min(1).max(32);
const password = z.string().min(8).max(128);

export const ProfileRequest = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('register'),
    name,
    password,
    birthday: z.string().regex(/^\d{4}-\d\d-\d\d$/),
    avatar: z.string().max(8).optional(),
  }),
  z.object({ action: z.literal('login'), name, password }),
  z.object({ action: z.literal('logout') }),
  z.object({ action: z.literal('logoutAll') }),
  z.object({ action: z.literal('changePassword'), password, newPassword: password }),
  z.object({ action: z.literal('deleteAccount'), password }),
]);
export type ProfileRequest = z.infer<typeof ProfileRequest>;

// The birth date is never sent back, only whether the profile is 18 or over.
export const PublicProfile = z
  .object({ id: z.string(), name: z.string(), avatar: z.string(), adult: z.boolean() })
  .strict();
export type PublicProfile = z.infer<typeof PublicProfile>;

// 200 for GET and POST /api/profile. `profile` is null when nobody is signed in.
export const ProfileResponse = z.object({ profile: PublicProfile.nullable() }).strict();

// The signed-in profile's own progress (/api/profile/progress). 401 when nobody is signed in.
// POST { action: 'favourite', game, favourite } adds or removes a favourite game and answers the same.
export const ProgressRequest = z
  .object({ action: z.literal('favourite'), game: z.enum(gameIds), favourite: z.boolean() })
  .strict();
export type ProgressRequest = z.infer<typeof ProgressRequest>;
export const ProgressResponse = z
  .object({
    // Oldest first. `earnedAt` is in milliseconds since 1970.
    achievements: z.array(z.object({ id: z.string(), game: z.enum(gameIds), earnedAt: z.number() }).strict()),
    favourites: z.array(z.enum(gameIds)),
  })
  .strict();
export type ProgressResponse = z.infer<typeof ProgressResponse>;

// 200 for GET /api/after-hours. 403 when the profile is not an adult.
export const AfterHoursResponse = z
  .object({
    games: z.array(z.enum(gameIds)),
  })
  .strict();
