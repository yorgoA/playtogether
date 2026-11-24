# Working on PlayTogether

Several people and AI agents work here at the same time. These rules keep their changes from colliding.

## Who owns what

| Area | Files |
| --- | --- |
| Frontend | `app/page.tsx`, `app/layout.tsx`, `app/join/`, `app/globals.css`, `components/`, `public/`, `lib/arcade/`, `lib/controller/`, `lib/catalog.ts` |
| Backend | `app/api/`, `lib/server/`, `lib/island/`, `db/`, `drizzle/`, `worker/`, `tests/`, `.github/`, config files in the root |

Change only your own area. When a task needs the other area, such as a new API field, stop and say what you need so its owner can make the change. A small edit that cannot land separately is fine if the pull request description points it out.

`lib/island/board.ts` runs on the server and on phones. It is backend-owned, and changes to its exports need a matching frontend change.

The API routes, their request fields and the response types in `lib/controller/room.ts` are the contract between the two areas. Adding a field is safe. Renaming or removing one needs both owners.

## Branches and pull requests

- Never commit to `main`. Branch from an up-to-date `main`: `feature/…`, `fix/…`, `chore/…` or `test/…`.
- One topic per pull request. Merge only when CI is green.
- Two agents must never share a working folder. Give each its own: `git worktree add ../playtogether-<name> -b <branch> origin/main`, then `npm ci && npm run db:local` inside it.
- Each folder has its own local database. Two dev servers need different ports.

## Before opening a pull request

Run `npm run check`: lint, formatting, types, tests and build. `npm run format` fixes formatting. Prettier covers backend files only for now; do not reformat other files.

- Backend lint errors fail. Screens have existing lint warnings; do not add more.
- A change to game rules, permissions or scoring comes with a test in `tests/`.

## Database

Tables are defined in `db/schema.ts`. Change that file and run `npm run db:generate`. Never write migrations by hand and never edit one that has been merged.

Known gap: `drizzle/0001_profiles.sql` was written by hand, so the profile tables are missing from `db/schema.ts` and `drizzle/meta`. Do not run `npm run db:generate` until that is repaired.

## Security

- Decide game results, hidden hands, quiz answers and permissions on the server. Never trust the client for them.
- Never return tokens, password hashes or another player's hand.
- Never commit secrets. Use `.dev.vars`, which Git ignores.
