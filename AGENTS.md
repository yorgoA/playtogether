# Working on PlayTogether

Several people and AI agents work here at the same time. These rules keep their changes from colliding.

## Who owns what

| Area | Files |
| --- | --- |
| Frontend | `app/page.tsx`, `app/layout.tsx`, `app/join/`, `app/globals.css`, `components/`, `public/`, `lib/controller/`, `lib/catalog.ts` |
| Backend | `app/api/`, `lib/server/`, `lib/contract/`, `lib/island/`, `db/`, `drizzle/`, `worker/`, `tests/`, `.github/`, config files in the root |

`.github/CODEOWNERS` follows this table, so GitHub asks the owner of each area to review the pull requests that touch it.

Change only your own area. When a task needs the other area, such as a new API field, stop and say what you need so its owner can make the change. A small edit that cannot land separately is fine if the pull request description points it out.

`lib/island/board.ts` runs on the server and on phones. It is backend-owned, and changes to its exports need a matching frontend change.

The contract between the two areas is `lib/contract/` (Zod schemas for every request and response). The server rejects requests that do not match it, with a 400 naming the field, and `tests/contract.test.ts` checks real responses against it. Screens can import its types: `import type { RoomSnapshot } from '@/lib/contract'`.

- Changing the API means changing `lib/contract/` first. A response field the contract does not list fails CI, so a leak of private data fails too. Removing or retyping a field that `lib/controller/room.ts` reads fails `npm run typecheck`.
- Adding a field: backend adds it to the contract and the server in one pull request; the screens may use it once that is merged.
- Renaming or removing a field needs both owners.

## Branches and pull requests

- Never commit to `main`. Branch from an up-to-date `main`: `feature/…`, `fix/…`, `chore/…` or `test/…`.
- One topic per pull request. Merge only when CI is green.
- Two agents must never share a working folder. Give each its own: `git worktree add ../playtogether-<name> -b <branch> origin/main`, then `npm ci && npm run db:local` inside it.
- Each folder has its own local database. Two dev servers need different ports.

## Before opening a pull request

Run `npm run check`: lint, formatting, types, tests and build. `npm run format` fixes formatting. Prettier covers backend files only for now; do not reformat other files.

- Backend lint errors fail. Screens have existing lint warnings; do not add more.
- A change to game rules, permissions or scoring comes with a test in `tests/`.
- `tests/simulation/` plays full rooms on slow, lossy and dropped connections. Its phones copy the polling and clock rules of `lib/controller/room.ts`; keep them in step. `PLAYTOGETHER_URL=http://localhost:5173 npm run test:live` plays the same matches against a running server.

## Database

Tables are defined in `db/schema.ts`. Change that file and run `npm run db:generate`. Never write migrations by hand and never edit one that has been merged.

`npm run db:verify` (also run by `npm run check` and CI) fails when `db/schema.ts` and the migrations disagree, for example after a hand-edited migration or a schema change without `npm run db:generate`. One thing Drizzle cannot express: `profiles.name` is case-insensitive (`COLLATE NOCASE`) in `drizzle/0001_profiles.sql`. Tests in `tests/` apply every migration to a real SQLite database and run the API routes against it.

## Security

- Decide game results, hidden hands, quiz answers and permissions on the server. Never trust the client for them.
- Never return tokens, password hashes or another player's hand.
- Profile sessions are stored as SHA-256 hashes, wrong passwords and sign-ups are rate limited (`lib/server/profiles.ts`), and `POST /api/profile` also supports `logoutAll`, `changePassword` and `deleteAccount`. Keep these behaviours when changing it; `tests/security.test.ts` covers them.
- Never commit secrets. Use `.dev.vars`, which Git ignores.
