import { defineConfig } from 'tsdown';

export default defineConfig(
  [
    'src/index.ts',
    'src/shim.ts',
    'src/cli.ts',
    'src/pg.ts',
    'src/sqlite3.ts',
    'src/cloudflare.ts',
  ].map((entry) => ({
    dts: true,
    format: ['esm', 'cjs'],
    fixedExtension: false,
    minify: false,
    target: 'esnext',
    outDir: 'dist',
    sourcemap: true,
    deps: {
      skipNodeModulesBundle: true,
      neverBundle: [
        '@cloudflare/workers-types',
        '@types/mongodb',
        '@types/pg',
        'pg',
        'sqlite3',
        'ansis',
        'cli-table3',
        'commander',
        'uuid',
        '@event-driven-io/dumbo',
      ],
    },
    tsconfig: 'tsconfig.build.json',
    entry,
  })),
);
