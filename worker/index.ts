import handler from 'vinext/server/fetch-handler';
import { stagingGate } from '../lib/server/staging-gate';

const worker = {
  async fetch(req: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    // Static files are served before the Worker runs, so only pages and the API pass here.
    return (await stagingGate(req, env.STAGING_PASSWORD)) ?? handler.fetch(req, env, ctx);
  },
};
export default worker;
