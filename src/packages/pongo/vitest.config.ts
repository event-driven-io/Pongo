import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      './vitest.unit.config.ts',
      './vitest.sqlite.config.ts',
      './vitest.postgresql.config.ts',
      './vitest.mongodb.config.ts',
    ],
  },
});
