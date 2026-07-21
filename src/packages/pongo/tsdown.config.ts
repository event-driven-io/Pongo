import { defineConfig } from 'tsdown';

const entries = [
  'src/index.ts',
  'src/shim.ts',
  'src/cli.ts',
  'src/pg.ts',
  'src/sqlite3.ts',
  'src/cloudflare.ts',
];

const sharedConfig = {
  fixedExtension: false,
  minify: false,
  target: 'esnext',
  outDir: 'dist',
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
      '@event-driven-io/dumbo/pg',
      '@event-driven-io/dumbo/sqlite3',
      '@event-driven-io/dumbo/cloudflare',
      '@event-driven-io/dumbo/postgresql',
      '@event-driven-io/dumbo/sqlite',
    ],
  },
  tsconfig: 'tsconfig.build.json',
} as const;

const jsEntries = entries.map((entry) => ({
  ...sharedConfig,
  dts: false,
  format: ['esm', 'cjs'],
  sourcemap: true,
  entry,
}));

const declarationBundle = (dtsExtension?: '.d.cts') => ({
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
