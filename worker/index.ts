import handler from 'vinext/server/fetch-handler';
import { withSecurityHeaders } from '../lib/server/security-headers';
import { stagingGate } from '../lib/server/staging-gate';

const worker = {
  async fetch(req: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    // Static files are served before the Worker runs, so only pages and the API pass here.
    const res = (await stagingGate(req, env.STAGING_PASSWORD)) ?? (await handler.fetch(req, env, ctx));
    return withSecurityHeaders(res, new URL(req.url).protocol === 'https:');
  },
};
export default worker;
