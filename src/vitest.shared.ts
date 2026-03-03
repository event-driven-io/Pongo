import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.spec.ts'],
    exclude: ['**/*.browser.spec.ts', '**/node_modules/**', '**/dist/**'],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
