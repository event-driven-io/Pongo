import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test.mjs'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
