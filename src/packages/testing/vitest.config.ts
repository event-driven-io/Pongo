import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['./vitest.postgresql.config.ts', './vitest.mongodb.config.ts'],
  },
});
