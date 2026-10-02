import { defineConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    name: '@event-driven-io/pongo (unit)',
    exclude: [
      ...(shared.test?.exclude ?? []),
      '**/*.int.spec.ts',
      '**/*.e2e.spec.ts',
    ],
  },
});
