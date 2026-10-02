import type { PluginInput } from '@opencode-ai/plugin';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, describe, expect, it } from 'vitest';
import { ValidateChangePlugin } from './validate-change.ts';

const execFileAsync = promisify(execFile);

const repositories: string[] = [];

const createRepository = async (checkExitCode: 0 | 1) => {
  const root = await mkdtemp(join(tmpdir(), 'validate-change-plugin-int-'));
  repositories.push(root);

  await execFileAsync('git', ['init', '--quiet'], { cwd: root });
  await mkdir(join(root, 'src'));
  await writeFile(
    join(root, 'src/agent-check.cjs'),
    [
      `require('node:fs').appendFileSync('agent-check-runs', 'ran\\n');`,
      `console.error('check output in ' + process.cwd());`,
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

const startPlugin = async (checkExitCode: 0 | 1) => {
  const worktree = await createRepository(checkExitCode);
  const toasts: unknown[] = [];
  const logs: unknown[] = [];
  const client = {
    app: {
      log: async (options: unknown) => {
        logs.push(options);
        return true;
      },
    },
    tui: {
      showToast: async (options: unknown) => {
        toasts.push(options);
        return true;
      },
    },
  };

  const hooks = await ValidateChangePlugin({
    client,
    worktree,
  } as unknown as PluginInput);

  const useTool = (sessionID: string, tool: string) =>
    hooks['tool.execute.after']!(
      { tool, sessionID, callID: `${tool}-call`, args: {} },
      { title: tool, output: '', metadata: {} },
    );

  const becomeIdle = (sessionID: string) =>
    hooks.event!({
      event: {
        type: 'session.status',
        properties: { sessionID, status: { type: 'idle' } },
      },
    });

  return { worktree, toasts, logs, useTool, becomeIdle };
};

describe.concurrent('validate-change OpenCode plugin', () => {
  afterAll(async () => {
    await Promise.all(
      repositories.map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it('does not run the check when the session goes idle without edits', async () => {
    const plugin = await startPlugin(1);

    await plugin.becomeIdle('session-1');

    expect(await checkRuns(plugin.worktree)).toBe(0);
    expect(plugin.toasts).toEqual([]);
  });

  it('does not run the check when the session only used tools that do not edit files', async () => {
    const plugin = await startPlugin(1);

    await plugin.useTool('session-1', 'read');
    await plugin.useTool('session-1', 'bash');
    await plugin.becomeIdle('session-1');

    expect(await checkRuns(plugin.worktree)).toBe(0);
    expect(plugin.toasts).toEqual([]);
  });

  it('runs the check once after an edit when the check passes', async () => {
    const plugin = await startPlugin(0);

    await plugin.useTool('session-1', 'edit');
    await plugin.becomeIdle('session-1');
    await plugin.becomeIdle('session-1');

    expect(await checkRuns(plugin.worktree)).toBe(1);
    expect(plugin.toasts).toEqual([]);
    expect(plugin.logs).toEqual([]);
  });

  it('shows an error toast after an edit when the check fails, and checks again on the next idle', async () => {
    const plugin = await startPlugin(1);

    await plugin.useTool('session-1', 'write');
    await plugin.becomeIdle('session-1');
    await plugin.becomeIdle('session-1');

    expect(await checkRuns(plugin.worktree)).toBe(2);
    expect(plugin.toasts).toEqual([
      {
        body: {
          message: '`npm run agent:check` failed. See the OpenCode log.',
          variant: 'error',
        },
      },
      {
        body: {
          message: '`npm run agent:check` failed. See the OpenCode log.',
          variant: 'error',
        },
      },
    ]);
    const errorLog = {
      body: {
        service: 'validate-change',
        level: 'error',
        message: expect.stringContaining(
          `check output in ${join(plugin.worktree, 'src')}`,
        ),
      },
    };
    expect(plugin.logs).toEqual([errorLog, errorLog]);
  });

  it('does not start a second check when the session goes idle again while the check runs', async () => {
    const plugin = await startPlugin(0);

    await plugin.useTool('session-1', 'edit');
    await Promise.all([
      plugin.becomeIdle('session-1'),
      plugin.becomeIdle('session-1'),
    ]);

    expect(await checkRuns(plugin.worktree)).toBe(1);
  });

  it('runs the check only for the session that edited files', async () => {
    const plugin = await startPlugin(0);

    await plugin.useTool('session-a', 'apply_patch');
    await plugin.becomeIdle('session-b');
    const runsAfterOtherSessionIdle = await checkRuns(plugin.worktree);
    await plugin.becomeIdle('session-a');

    expect(runsAfterOtherSessionIdle).toBe(0);
    expect(await checkRuns(plugin.worktree)).toBe(1);
  });
});
