declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    BUCKET?: R2Bucket;
    // A secret set on the staging Worker only. See lib/server/staging-gate.ts.
    STAGING_PASSWORD?: string;
  }
}

interface ImportMetaEnv {
  // Set by vite.config.ts when `npm run dev:lan` exposes the server on the network.
  readonly VITE_LAN_HOST?: string;
}
