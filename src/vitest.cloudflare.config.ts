import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath:
          './packages/dumbo/wrangler.durable-object-sqlite.jsonc',
      },
    }),
  ],
  test: {
    name: '@event-driven-io/cloudflare',
    include: [
      'packages/dumbo/src/storage/sqlite/durableObject/**/*.int.spec.ts',
      'packages/dumbo/src/storage/sqlite/durableObject/**/*.e2e.spec.ts',
      'packages/pongo/src/storage/sqlite/durableObject/**/*.int.spec.ts',
      'packages/pongo/src/storage/sqlite/durableObject/**/*.e2e.spec.ts',
      'packages/pongo/src/e2e/sqlite/durableObject/**/*.int.spec.ts',
      'packages/pongo/src/e2e/sqlite/durableObject/**/*.e2e.spec.ts',
    ],
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
