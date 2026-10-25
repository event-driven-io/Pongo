import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [packageManager, projectDir, ...packageNames] = process.argv.slice(2);

if (packageManager !== 'npm' || !projectDir || packageNames.length === 0) {
  throw new Error(
    'Usage: node e2e/installLocalPackages.ts npm <fixture> <package names...>',
  );
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporaryDirectory = mkdtempSync(join(tmpdir(), 'pongo-compat-'));
const consumerDirectory = join(temporaryDirectory, 'consumer');
const packagesDirectory = join(temporaryDirectory, 'packages');

const run = (args: string[], cwd: string) => {
  const result = spawnSync('npm', args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(' ')} failed in ${cwd}`);
  }
};

try {
  mkdirSync(packagesDirectory);
  cpSync(resolve(root, projectDir), consumerDirectory, {
    recursive: true,
    filter: (source) =>
      !['node_modules', 'packages', 'dist', '.vite'].includes(basename(source)),
  });

  run(
    [
      'pack',
      '--quiet',
      '--pack-destination',
      packagesDirectory,
      ...packageNames.flatMap((name) => ['-w', `@event-driven-io/${name}`]),
    ],
    root,
  );

  const tarballs = readdirSync(packagesDirectory);
  if (tarballs.length !== packageNames.length) {
    throw new Error('Not all requested workspace packages were packed');
  }

  run(['ci'], consumerDirectory);
  run(
    [
      'install',
      '--no-save',
      ...tarballs.map((file) => join(packagesDirectory, file)),
    ],
    consumerDirectory,
  );
  run(['test'], consumerDirectory);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
