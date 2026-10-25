import { defineConfig, type UserConfig } from 'tsdown';

const entries = [
  'src/index.ts',
  'src/postgresql.ts',
  'src/pg.ts',
  'src/sqlite.ts',
  'src/sqlite3.ts',
  'src/cloudflare.ts',
];

const sharedConfig = {
  fixedExtension: false,
  minify: false,
  target: 'esnext',
  outDir: 'dist',
  deps: {
    neverBundle: [
      '@cloudflare/workers-types',
      '@types/pg',
      'ansis',
      'pg',
      'sqlite3',
      'uuid',
    ],
  },
  tsconfig: 'tsconfig.build.json',
} satisfies UserConfig;

const jsEntries = entries.map((entry): UserConfig => ({
  ...sharedConfig,
  dts: false,
  format: ['esm', 'cjs'],
  sourcemap: true,
  entry,
}));

const declarationBundle = (dtsExtension?: '.d.cts'): UserConfig => ({
  ...sharedConfig,
  clean: false,
  dts: {
    emitDtsOnly: true,
    ...(dtsExtension && { cjsDefault: true }),
  },
  entry: entries,
  // rolldown-plugin-dts bundles declarations through ESM output only.
  // emitDtsOnly removes JS output; outExtensions only changes declaration names.
  format: ['esm'],
  ...(dtsExtension && {
    outExtensions: () => ({ dts: dtsExtension }),
  }),
  sourcemap: false,
});

export default defineConfig([
  ...jsEntries,
  declarationBundle(),
  declarationBundle('.d.cts'),
]);
