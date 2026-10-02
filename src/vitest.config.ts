import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    ...(process.env.CI ? {} : { maxWorkers: '50%' }),
    projects: [
      'packages/dumbo/vitest.unit.config.ts',
      'packages/dumbo/vitest.sqlite.config.ts',
      'packages/dumbo/vitest.postgresql.config.ts',
      'vitest.cloudflare.config.ts',
      'packages/pongo/vitest.unit.config.ts',
      'packages/pongo/vitest.sqlite.config.ts',
      'packages/pongo/vitest.postgresql.config.ts',
      'packages/pongo/vitest.mongodb.config.ts',
      'packages/testing/vitest.unit.config.ts',
      'packages/testing/vitest.postgresql.config.ts',
      'packages/testing/vitest.mongodb.config.ts',
      {
        test: {
          name: 'bundle',
          environment: 'node',
          include: ['e2e/bundleBoundaries.bundle.spec.ts'],
          globalSetup: ['e2e/buildBundles.ts'],
        },
      },
      {
        test: {
          name: 'agents',
          environment: 'node',
          include: ['../.agents/**/*.spec.ts', '../.opencode/**/*.spec.ts'],
        },
      },
    ],
  },
});
