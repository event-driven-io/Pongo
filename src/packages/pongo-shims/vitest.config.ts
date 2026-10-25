import { defineConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    name: '@event-driven-io/pongo-shims',
    passWithNoTests: true,
    exclude: [...(shared.test?.exclude ?? []), '**/*.type.spec.ts'],
  },
});
