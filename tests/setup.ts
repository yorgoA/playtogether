import { vi } from 'vitest';

// Tests play with our own questions. Only the live test talks to a real server.
if (!process.env.PLAYTOGETHER_URL)
  vi.stubGlobal('fetch', () => Promise.reject(new Error('No network in tests.')));
