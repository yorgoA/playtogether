// Fails when db/schema.ts has changes that no migration contains.
// Generates into a temporary copy, so the real drizzle/ folder is never touched.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync } from 'node:fs';

// Relative, because drizzle-kit prefixes the output folder with './'. Git ignores node_modules.
const copy = `node_modules/.cache/drizzle-check-${process.pid}`;
mkdirSync(copy, { recursive: true });
try {
  cpSync('drizzle', copy, { recursive: true });
  const output = execFileSync(
    'npx',
    ['drizzle-kit', 'generate', '--dialect', 'sqlite', '--schema', './db/schema.ts', '--out', copy, '--name', 'unmigrated'],
    { encoding: 'utf8' },
  );
  if (!/No schema changes/.test(output)) {
    console.error('db/schema.ts has changes with no migration. Run `npm run db:generate` and commit the result.');
    process.exitCode = 1;
  }
} finally {
  rmSync(copy, { recursive: true, force: true });
}
