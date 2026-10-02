import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { recordEdit } from './record-edit.ts';
import { validateChangedSession } from './validate-change.ts';

const execFileAsync = promisify(execFile);

const stopScript = join(import.meta.dirname, 'validate-change.ts');
const recordEditScript = join(import.meta.dirname, 'record-edit.ts');

type HookRun = { exitCode: number; stdout: string; stderr: string };

const runHook = (script: string, input: string) =>
  new Promise<HookRun>((resolve) => {
    const child = execFile(
      process.execPath,
      [script],
      (error, stdout, stderr) =>
        resolve({
          exitCode: typeof error?.code === 'number' ? error.code : 0,
          stdout,
          stderr,
        }),
    );
    child.stdin?.end(input);
  });

const hookInput = (cwd: string) =>
  JSON.stringify({ cwd, session_id: 'session-1' });

const repositories: string[] = [];

const createRepository = async (checkExitCode: 0 | 1) => {
  const root = await mkdtemp(join(tmpdir(), 'validate-change-int-'));
  repositories.push(root);

  await execFileAsync('git', ['init', '--quiet'], { cwd: root });
  await mkdir(join(root, 'src'));
  await writeFile(
    join(root, 'src/agent-check.cjs'),
    [
      `require('node:fs').appendFileSync('agent-check-runs', 'ran\\n');`,
      `console.error('check output');`,
      `process.exit(${checkExitCode});`,
    ].join('\n'),
  );
  await writeFile(
    join(root, 'src/package.json'),
    JSON.stringify({
      private: true,
      scripts: { 'agent:check': 'node agent-check.cjs' },
    }),
  );

  return root;
};

const checkRuns = async (root: string) => {
  try {
    const runs = await readFile(join(root, 'src/agent-check-runs'), 'utf8');
    return runs.split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
};

afterAll(async () => {
  await Promise.all(
    repositories.map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe.concurrent('validate-change hook', () => {
  it('passes without running the check when the session did not edit files', async () => {
    const root = await createRepository(1);

    const result = await validateChangedSession({
      cwd: root,
      session_id: 'session-1',
    });

    expect(result).toEqual({ ok: true, output: '' });
    expect(await checkRuns(root)).toBe(0);
  });

  it('runs the check once after an edit when the check passes', async () => {
    const root = await createRepository(0);
    const input = { cwd: root, session_id: 'session-1' };

    recordEdit(input);
    const firstResult = await validateChangedSession(input);
    const secondResult = await validateChangedSession(input);

    expect(firstResult.ok).toBe(true);
    expect(secondResult).toEqual({ ok: true, output: '' });
    expect(await checkRuns(root)).toBe(1);
  });
});

describe.concurrent('validate-change hook script', () => {
  it('passes without running the check when the session did not edit files', async () => {
    const root = await createRepository(1);

    const stop = await runHook(stopScript, hookInput(root));

    expect(stop).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(await checkRuns(root)).toBe(0);
  });

  it('runs the check once after an edit when the check passes', async () => {
    const root = await createRepository(0);

    const mark = await runHook(recordEditScript, hookInput(root));
    const firstStop = await runHook(stopScript, hookInput(root));
    const secondStop = await runHook(stopScript, hookInput(root));

    expect(mark).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(firstStop).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(secondStop).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(await checkRuns(root)).toBe(1);
  });

  it('blocks with the check output after an edit when the check fails, and checks again on the next stop', async () => {
    const root = await createRepository(1);

    await runHook(recordEditScript, hookInput(root));
    const firstStop = await runHook(stopScript, hookInput(root));
    const secondStop = await runHook(stopScript, hookInput(root));

    expect(firstStop.exitCode).toBe(2);
    expect(firstStop.stderr).toContain('`npm run agent:check` failed.');
    expect(firstStop.stderr).toContain('check output');
    expect(secondStop.exitCode).toBe(2);
    expect(await checkRuns(root)).toBe(2);
  });

  it('runs the check in the repository root when the session works in a subdirectory', async () => {
    const root = await createRepository(0);

    await runHook(recordEditScript, hookInput(join(root, 'src')));
    const stop = await runHook(stopScript, hookInput(join(root, 'src')));

    expect(stop).toEqual({ exitCode: 0, stdout: '', stderr: '' });
    expect(await checkRuns(root)).toBe(1);
  });
});
