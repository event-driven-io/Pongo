import { defineConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    name: '@event-driven-io/pongo (mongodb)',
    include: [
      'src/e2e/postgresql/pg/compatibilityTest.e2e.spec.ts',
      'src/e2e/postgresql/pg/postgres.upsert-shim.e2e.spec.ts',
    ],
    globalSetup: [
      '@event-driven-io/testing/postgresql/globalSetup',
      '@event-driven-io/testing/mongodb/globalSetup',
    ],
  },
});
