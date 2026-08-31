import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/*.spec.ts'],
    exclude: [
      '**/*.browser.spec.ts',
      '**/src/storage/sqlite/durableObject/**/*.int.spec.ts',
      '**/src/storage/sqlite/durableObject/**/*.e2e.spec.ts',
      '**/src/e2e/sqlite/durableObject/**/*.int.spec.ts',
      '**/src/e2e/sqlite/durableObject/**/*.e2e.spec.ts',
      '**/node_modules/**',
      '**/dist/**',
    ],
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
