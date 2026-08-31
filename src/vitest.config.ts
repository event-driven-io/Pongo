import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      'packages/dumbo',
      'vitest.cloudflare.config.ts',
      'packages/pongo',
      {
        test: {
          name: 'bundle',
          environment: 'node',
          include: ['e2e/bundleBoundaries.bundle.spec.ts'],
        },
      },
    ],
  },
});
