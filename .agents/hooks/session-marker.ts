import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../..',
);

export type HookInput = {
  cwd?: string;
  session_id?: string;
  stop_hook_active?: boolean;
};

export function parseHookInput(text: string): HookInput {
  try {
    const input: unknown = JSON.parse(text || '{}');
    return typeof input === 'object' && input !== null
      ? (input as HookInput)
      : {};
  } catch {
    return {};
  }
}

export function readHookInput() {
  try {
    return parseHookInput(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

export function sessionMarkerName(input: HookInput) {
  return typeof input.session_id === 'string' &&
    /^[A-Za-z0-9_-]+$/.test(input.session_id)
    ? input.session_id
    : undefined;
}

export function resolveRoot(input: HookInput) {
  if (typeof input.cwd !== 'string') {
    return repositoryRoot;
  }

  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: input.cwd,
    encoding: 'utf8',
    windowsHide: true,
  });

  return result.status === 0 ? result.stdout.trim() : repositoryRoot;
}

export function markerPath(input: HookInput, root: string) {
  const name = sessionMarkerName(input);

  return name
    ? join(root, 'src/node_modules/.cache/pongo-agent-check', name)
    : undefined;
}
