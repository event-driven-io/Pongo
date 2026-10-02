import { defineConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    name: '@event-driven-io/testing (unit)',
    include: ['src/**/*.unit.spec.ts'],
  },
});
