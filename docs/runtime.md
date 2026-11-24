# Local runtime

PlayTogether uses React and Vinext with Vite. Wrangler runs a local Workers runtime and emulates the D1 database using SQLite. The database binding is named `DB` in `wrangler.jsonc`.

Run `npm run db:local` after cloning and whenever a new migration lands. Wrangler records applied migrations. Both the dev server and the built preview use the ignored `.wrangler/state/` directory. The server expires rooms after 24 hours of inactivity.

Run `npm run build` followed by `npm start` to preview the production bundle on loopback. Use `npm run dev:lan` for phone testing on trusted Wi-Fi. The game creates room and player tokens locally. Development commands do not deploy a site.
