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
  test: { include: ['tests/**/*.test.ts'], setupFiles: [here('tests/setup.ts')] },
});
