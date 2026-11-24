# PlayTogether

PlayTogether turns a shared screen into a game table and each player's phone into a controller. Open the host screen on a TV or laptop, create a room, and scan its QR code with a phone to join.

## Island Settlers

The shared screen shows the island, settlements, roads, ports, dice, and construction costs. Players use their phones to view their hand and choose actions for the current phase. Add bots to fill seats when playing solo or with a smaller group.

## Run locally

Use Node.js 22.13 or later. From the repository root, run:

```sh
npm run install:ci
npm run dev
```

Open the address printed by the server. To try the controller on the same computer, open the join link in a separate browser profile. A phone needs a reachable host address. Use the private hosted site for a multi-device session when developing on loopback.

## Working on the game

| Path | Purpose |
| --- | --- |
| `app/` | Host page, phone join page, and API routes |
| `lib/island/` | Island Settlers rules and game logic |
| `lib/controller/` | Phone controller logic |
| `lib/arcade/` | Arcade game logic |
| `public/art/` | Game artwork |

Run `npm run lint` to check the source and `npm run build` to generate the production bundle. Run `npm start` to preview that build locally. See the [runtime guide](docs/runtime.md) for database setup, local authentication, preview profiles, and Sites publishing.
