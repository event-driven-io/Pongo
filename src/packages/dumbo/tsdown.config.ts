import { defineConfig } from 'tsdown';

export default defineConfig(
  [
    'src/index.ts',
    'src/postgresql.ts',
    'src/pg.ts',
    'src/sqlite.ts',
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
        'uuid',
      ],
    },
    tsconfig: 'tsconfig.build.json',
    entry,
  })),
);
