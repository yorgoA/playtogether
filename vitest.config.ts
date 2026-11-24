import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts: the game rules run without the Workers runtime.
export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
