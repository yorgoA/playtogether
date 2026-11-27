// Fails when the built Worker nears the 3 MB (gzipped) that the Workers Free plan accepts, before a deploy fails on it.
// Run after `npm run build`. The dry run bundles the Worker without uploading it.
import { execFileSync } from 'node:child_process';
import { stripVTControlCharacters } from 'node:util';

const limitKiB = 2560;

const output = execFileSync('npx', ['wrangler', 'deploy', '--dry-run', '--config', 'dist/server/wrangler.json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
});
const size = stripVTControlCharacters(output).match(/gzip: ([\d.]+) KiB/);
if (!size) {
  console.error('Could not find the gzipped size in the output of `wrangler deploy --dry-run`:\n' + output);
  process.exitCode = 1;
} else if (Number(size[1]) > limitKiB) {
  console.error(
    `The Worker is ${size[1]} KiB gzipped, over the ${limitKiB} KiB limit. The Workers Free plan refuses 3 MB.`,
  );
  process.exitCode = 1;
} else {
  console.log(`The Worker is ${size[1]} KiB gzipped, under the ${limitKiB} KiB limit.`);
}
