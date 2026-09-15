import { spawnSync } from 'node:child_process';

// The boundaries are a property of what tsdown emits, so the suite builds the
// packages itself rather than reading whatever happens to be in dist.
export default function buildBundles(): void {
  for (const workspace of ['packages/dumbo', 'packages/pongo']) {
    const build = spawnSync('npm', ['run', 'build', '-w', workspace], {
      encoding: 'utf8',
    });

    if (build.status !== 0) {
      throw new Error(`Failed to build ${workspace}:\n${build.stderr}`);
    }
  }
}
