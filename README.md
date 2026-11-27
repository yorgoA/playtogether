# PlayTogether

PlayTogether turns a shared screen into a game table and each player's phone into a controller. Open the host screen on a TV or laptop, create a room, and scan its QR code with a phone to join.

## Island Settlers

The shared screen shows the island, settlements, roads, ports, dice, construction costs, and how many cards each player holds. Players use their phones to view their hand, costs, and remaining pieces (15 roads, 5 settlements, 4 cities), and choose actions for the current phase. Add bots to fill seats when playing solo or with a smaller group. Every match shuffles the terrain, numbers, and ports, and players roll to decide the turn order, highest first. Development cards, the longest road (5+), and the strongest army (3+ knights) count toward the ten points needed to win. Trades can include several cards on each side, and the bank holds 19 of each resource.

## Storm Deck

A shedding card game for two to eight players. Play on either of two shared piles by element or neighbouring number, keep a streak going, and avoid holding the fewest cards when the storm breaks. The TV shows the table; hands stay on phones. Rules shared by the server and phones are in `lib/storm/`.

## Run locally

Install Node.js 24 LTS and Git. Clone the private repository using your GitHub account, then run:

```sh
git clone https://github.com/yorgoA/playtogether.git
cd playtogether
npm ci
npm run db:local
npm run dev
```

Open the local URL printed in the terminal. The game runs on your computer without an API key or a hosting account. Room data stays in the local database.

### Play with phones on Wi-Fi

Stop the development server with Ctrl+C, then run `npm run dev:lan`. Open the local or **Network** URL printed by Vite on the host screen. The QR code uses your computer's Wi-Fi address, so phones on the same Wi-Fi can join. If prompted, allow incoming connections on your private network. Use touch controls on local HTTP. Motion controls may require HTTPS on your phone.

## Put it online

The game runs on Cloudflare Workers in two environments, set in `wrangler.jsonc`. Each has its own D1 database.

| Environment | Address | Deployed |
| --- | --- | --- |
| Staging | `https://playtogether-staging.playtogether-hq.workers.dev` | After every push to `main` that passes CI |
| Production | `https://playtogether.playtogether-hq.workers.dev` | By hand: **Actions → Deploy → Run workflow** on `main` |

`.github/workflows/deploy.yml` builds for the environment, applies its database migrations, then deploys. Try a change on staging before you run the workflow for production. Phones join over HTTPS on both, so motion controls work too.

Staging is private. Its pages and API ask for a password once per device, then a cookie keeps you in for 30 days. The password is the `STAGING_PASSWORD` secret of the `playtogether-staging` Worker: in the Cloudflare dashboard, **Workers & Pages → playtogether-staging → Settings → Variables and Secrets**. Changing it signs everyone out. Production and local development have no such secret, so they stay open. Static files such as images and scripts are served without the password: they are in this public repository anyway.

The workflow uses two repository secrets, `CLOUDFLARE_ACCOUNT_ID` (shown on the Workers & Pages overview) and `CLOUDFLARE_API_TOKEN`. Without them, it only notes that it skipped. To create or replace the token:

1. In the project's Cloudflare dashboard, under **My Profile → API Tokens**, create a token from the **Edit Cloudflare Workers** template. Add the **D1: Edit** permission, limit the account policy to the project's account, and remove the zone policy: the game has no domain of its own.
2. Run `gh secret set CLOUDFLARE_API_TOKEN --repo yorgoA/playtogether` and paste the token when asked. Any collaborator can do this from the command line. The **Settings** page of the repository needs admin access.

## Working together

| Area | Where to work |
| --- | --- |
| Shared screen and phone UI | `components/`, `app/page.tsx`, `app/join/`, and `public/art/` |
| Room API and persistence | `app/api/rooms/`, `lib/server/`, `db/`, and `drizzle/` |
| Game logic shared across screens | `lib/island/`, `lib/quiz/`, and `lib/controller/` |

Run `npm run check` before opening a pull request. GitHub runs the same checks. See [AGENTS.md](AGENTS.md) for who owns which files and how to work in parallel.

Use separate Git branches for design and backend work. Coordinate changes to room actions and response fields because both screens consume the same API.

See the [runtime guide](docs/runtime.md) for local builds and database details.
