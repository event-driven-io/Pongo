import { defineConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    name: '@event-driven-io/pongo (sqlite)',
    include: ['**/*.int.spec.ts', '**/*.e2e.spec.ts'],
    exclude: [
      ...(shared.test?.exclude ?? []),
      '**/postgresql/**',
      'src/commandLine/migrate.int.spec.ts',
    ],
  },
});
