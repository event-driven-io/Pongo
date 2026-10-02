import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  markerPath,
  readHookInput,
  repositoryRoot,
  resolveRoot,
  sessionMarkerName,
  type HookInput,
} from './session-marker.ts';

type CheckResult = { ok: boolean; output: string };

export function shouldRunCheck(input: HookInput, sessionEdited: boolean) {
  if (input.stop_hook_active) {
    return false;
  }

  return sessionEdited || sessionMarkerName(input) === undefined;
}

export function validateChange(root = repositoryRoot) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

  return new Promise<CheckResult>((done) => {
    const child = spawn(npm, ['run', 'agent:check'], {
      cwd: resolve(root, 'src'),
      windowsHide: true,
    });
    let output = '';

    child.stdout.setEncoding('utf8').on('data', (text) => (output += text));
    child.stderr.setEncoding('utf8').on('data', (text) => (output += text));
    child.on('error', (error) =>
      done({
        ok: false,
        output: [output, error.message].filter(Boolean).join('\n').trim(),
      }),
    );
    child.on('close', (code) =>
      done({ ok: code === 0, output: output.trim() }),
    );
  });
}

export async function validateChangedSession(input: HookInput) {
  const root = resolveRoot(input);
  const marker = markerPath(input, root);

  if (!shouldRunCheck(input, marker !== undefined && existsSync(marker))) {
    return { ok: true, output: '' };
  }

  const result = await validateChange(root);

  if (marker && result.ok) {
    rmSync(marker, { force: true });
  }

  return result;
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  const result = await validateChangedSession(readHookInput());

  if (!result.ok) {
    console.error(
      ['`npm run agent:check` failed.', result.output]
        .filter(Boolean)
        .join('\n\n'),
    );
    process.exitCode = 2;
  }
}
