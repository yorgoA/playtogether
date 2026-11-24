import { z } from 'zod';

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

// 200 for GET /api/after-hours. 403 when the profile is not an adult.
export const AfterHoursResponse = z
  .object({
    games: z.array(z.object({ name: z.string(), rule: z.string(), rounds: z.array(z.string()) }).strict()),
  })
  .strict();
