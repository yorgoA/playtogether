import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// Separate from vite.config.ts: the server code runs without the Workers runtime.
export default defineConfig({
  resolve: {
    alias: {
      '@': here('.'),
      'cloudflare:workers': here('tests/cloudflare-workers.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: [here('tests/setup.ts')],
    // `npm run test:coverage`. Floors just under today's figures, so coverage cannot quietly drop.
    coverage: {
      provider: 'v8',
      include: ['app/api/**', 'lib/server/**', 'lib/contract/**', 'lib/island/**', 'lib/bots/**', 'db/**'],
      reporter: ['text-summary', 'json-summary'],
      thresholds: { statements: 95, branches: 90, functions: 95, lines: 97 },
    },
  },
});
