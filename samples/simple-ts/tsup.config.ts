import { defineConfig } from 'tsup';

export default defineConfig({
  splitting: true,
  clean: true, // clean up the dist folder
  dts: true, // generate dts files
  format: ['cjs', 'esm'], // generate cjs and esm files
  minify: true, //env === 'production',
  bundle: true, //env === 'production',
  skipNodeModulesBundle: true,
  target: 'esnext',
  outDir: 'dist', //env === 'production' ? 'dist' : 'lib',
  entry: ['src/index.ts'],
  sourcemap: true,
  tsconfig: 'tsconfig.json', // workaround for https://github.com/egoist/tsup/issues/571#issuecomment-1760052931
});
