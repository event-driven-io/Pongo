import { defineConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    name: '@event-driven-io/testing (mongodb)',
    include: ['src/mongodb/**/*.int.spec.ts'],
    globalSetup: ['./src/mongodb/sharedMongoDBGlobalSetup.ts'],
  },
});
