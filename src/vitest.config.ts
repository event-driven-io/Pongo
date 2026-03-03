import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: ['packages/dumbo', 'packages/pongo'],
  },
});
