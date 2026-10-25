import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [],
    typecheck: {
      enabled: true,
      only: true,
      include: ['src/**/*.type.spec.ts'],
      tsconfig: './tsconfig.types.json',
    },
  },
});
