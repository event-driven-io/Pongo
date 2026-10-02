import { execFile } from 'node:child_process';
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { recordEdit } from './record-edit.ts';

const execFileAsync = promisify(execFile);

const hookScript = join(import.meta.dirname, 'record-edit.ts');

type HookRun = { exitCode: number; stdout: string; stderr: string };

const runHook = (input: string) =>
  new Promise<HookRun>((resolve) => {
    const child = execFile(
      process.execPath,
      [hookScript],
      (error, stdout, stderr) =>
        resolve({
          exitCode: typeof error?.code === 'number' ? error.code : 0,
          stdout,
          stderr,
        }),
    );
    child.stdin?.end(input);
  });

const markerDirectory = (root: string) =>
  join(root, 'src/node_modules/.cache/pongo-agent-check');

const repositories: string[] = [];

const createRepository = async () => {
  const root = await mkdtemp(join(tmpdir(), 'record-edit-int-'));
  repositories.push(root);

  await execFileAsync('git', ['init', '--quiet'], { cwd: root });
  await mkdir(join(root, 'src'));

  return root;
};

describe.concurrent('record-edit hook', () => {
  afterAll(async () => {
    await Promise.all(
      repositories.map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it('records the edit for the session from the hook script input', async () => {
    const root = await createRepository();

    const run = await runHook(
      JSON.stringify({ cwd: root, session_id: 'session-1' }),
    );

    expect(run).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(await readdir(markerDirectory(root))).toEqual(['session-1']);
  });

  it('records the edit for the session', async () => {
    const root = await createRepository();

    recordEdit({ cwd: root, session_id: 'session-1' });

    expect(await readdir(markerDirectory(root))).toEqual(['session-1']);
  });

  it('records the edit in the repository root when the session works in a subdirectory', async () => {
    const root = await createRepository();

    recordEdit({ cwd: join(root, 'src'), session_id: 'session-1' });

    expect(await readdir(markerDirectory(root))).toEqual(['session-1']);
  });

  it('does not record the edit when the session id is not valid', async () => {
    const root = await createRepository();

    recordEdit({ cwd: root, session_id: '../escape' });

    await expect(access(markerDirectory(root))).rejects.toThrow();
  });

  it('does not fail when the edit cannot be recorded', async () => {
    const root = await createRepository();
    await writeFile(join(root, 'src/node_modules'), '');

    expect(() =>
      recordEdit({ cwd: root, session_id: 'session-1' }),
    ).not.toThrow();
  });
});
