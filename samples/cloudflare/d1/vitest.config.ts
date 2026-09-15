import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: {
        configPath: './wrangler.jsonc',
      },
      miniflare: {
        bindings: {
          ENVIRONMENT: 'test',
          MIGRATION_TOKEN: 'test-migration-token',
        },
      },
    }),
  ],
  test: {
    include: ['src/**/*.spec.ts'],
    hookTimeout: 120_000,
    testTimeout: 30_000,
  },
});
