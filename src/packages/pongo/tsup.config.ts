import { defineConfig } from 'tsup';

const env = process.env.NODE_ENV;

export default defineConfig({
  splitting: true,
  clean: true, // clean up the dist folder
  dts: true, // generate dts files
  format: ['esm', 'cjs'], // generate cjs and esm files
  minify: false, //env === 'production',
  bundle: true, //env === 'production',
  skipNodeModulesBundle: true,
  watch: env === 'development',
  target: 'esnext',
  outDir: 'dist', //env === 'production' ? 'dist' : 'lib',
  entry: [
    'src/index.ts',
    'src/shim.ts',
    'src/cli.ts',
    'src/pg.ts',
    'src/sqlite3.ts',
    'src/cloudflare.ts',
  ],
  //entry: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/**/*.internal.ts'], //include all files under src but not specs
  sourcemap: true,
  external: ['sqlite3', 'pg', '@cloudflare/workers-types'],
  tsconfig: 'tsconfig.build.json', // workaround for https://github.com/egoist/tsup/issues/571#issuecomment-1760052931
});
