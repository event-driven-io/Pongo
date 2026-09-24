import { defineConfig } from 'vitest/config';
import shared from '../../vitest.shared.ts';

export default defineConfig({
  ...shared,
  test: {
    ...shared.test,
    pool: 'forks',
    execArgv: ['--expose-gc'],
  },
});
