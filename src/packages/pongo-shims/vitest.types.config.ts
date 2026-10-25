import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@event-driven-io/pongo-shims (types)',
    passWithNoTests: true,
    include: [],
    typecheck: {
      enabled: true,
      only: true,
      include: ['src/**/*.type.spec.ts'],
      tsconfig: './tsconfig.json',
    },
  },
});
