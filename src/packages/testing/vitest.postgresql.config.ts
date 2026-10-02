import { defineConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    name: '@event-driven-io/testing (postgresql)',
    include: ['src/postgresql/**/*.int.spec.ts'],
    globalSetup: ['./src/postgresql/sharedPostgreSQLGlobalSetup.ts'],
  },
});
