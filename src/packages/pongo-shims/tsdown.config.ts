import { defineConfig, type UserConfig } from 'tsdown';

const entries = ['src/mongodb.ts'];

const sharedConfig = {
  fixedExtension: false,
  minify: false,
  target: 'esnext',
  outDir: 'dist',
  deps: {
    dts: { alwaysBundle: ['mongodb', 'bson'] },
  },
  tsconfig: 'tsconfig.build.json',
  banner: {
    dts: '/* Bundled and adapted from mongodb 7.7.0 and bson 7.3.3 under Apache-2.0. See NOTICE and licenses for attribution and license terms. */',
  },
} satisfies UserConfig;

const declarationBundle = (dtsExtension?: '.d.cts'): UserConfig => ({
  ...sharedConfig,
  clean: false,
  dts: {
    emitDtsOnly: true,
    ...(dtsExtension && { cjsDefault: true }),
  },
  entry: entries,
  format: ['esm'],
  ...(dtsExtension && {
    outExtensions: () => ({ dts: dtsExtension }),
  }),
  sourcemap: false,
});

export default defineConfig([declarationBundle(), declarationBundle('.d.cts')]);
