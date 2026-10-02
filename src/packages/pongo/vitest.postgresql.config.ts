import { defineConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    name: '@event-driven-io/pongo (postgresql)',
    include: [
      '**/postgresql/**/*.int.spec.ts',
      '**/postgresql/**/*.e2e.spec.ts',
      'src/commandLine/migrate.int.spec.ts',
    ],
    exclude: [
      ...(shared.test?.exclude ?? []),
      'src/e2e/postgresql/pg/compatibilityTest.e2e.spec.ts',
      'src/e2e/postgresql/pg/postgres.upsert-shim.e2e.spec.ts',
    ],
    globalSetup: ['@event-driven-io/testing/postgresql/globalSetup'],
  },
});
