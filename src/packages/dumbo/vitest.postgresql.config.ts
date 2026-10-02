import { defineConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    name: '@event-driven-io/dumbo (postgresql)',
    pool: 'forks',
    execArgv: ['--expose-gc'],
    include: [
      '**/postgresql/**/*.int.spec.ts',
      '**/postgresql/**/*.e2e.spec.ts',
    ],
    globalSetup: ['@event-driven-io/testing/postgresql/globalSetup'],
  },
});
