# PlayTogether

PlayTogether turns a shared screen into a game table and each player's phone into a controller. Open the host screen on a TV or laptop, create a room, and scan its QR code with a phone to join.

## Island Settlers

The shared screen shows the island, settlements, roads, ports, dice, and construction costs. Players use their phones to view their hand and choose actions for the current phase. Add bots to fill seats when playing solo or with a smaller group.

## Run locally

Install Node.js 24 LTS and Git. Clone the private repository using your GitHub account, then run:

```sh
git clone https://github.com/yorgoA/playtogether.git
cd playtogether
npm ci
npm run db:local
npm run dev
```

Open the local URL printed in the terminal. The game runs on your computer without an OpenAI API key, a Claude API key, or a hosting account. Room data stays in the local database.

### Play with phones on Wi-Fi

Stop the development server with Ctrl+C, then run `npm run dev:lan`. Open the local or **Network** URL printed by Vite on the host screen. The QR code uses your computer's Wi-Fi address, so phones on the same Wi-Fi can join. If prompted, allow incoming connections on your private network. Use touch controls on local HTTP. Motion controls may require HTTPS on your phone.

## Working together

| Area | Where to work |
| --- | --- |
| Shared screen and phone UI | `components/`, `app/page.tsx`, `app/join/`, and `public/art/` |
| Room API and persistence | `app/api/rooms/`, `lib/server/`, `db/`, and `drizzle/` |
| Game logic shared across screens | `lib/island/`, `lib/controller/`, and `lib/arcade/` |

Use separate Git branches for design and backend work. Coordinate changes to room actions and response fields because both screens consume the same API.

See the [runtime guide](docs/runtime.md) for local builds and database details.
