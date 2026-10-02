import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  markerPath,
  readHookInput,
  resolveRoot,
  type HookInput,
} from './session-marker.ts';

export function recordEdit(input: HookInput) {
  try {
    const marker = markerPath(input, resolveRoot(input));

    if (marker) {
      mkdirSync(dirname(marker), { recursive: true });
      writeFileSync(marker, '');
    }
  } catch {
    // Recording edits must never block the agent.
  }
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  recordEdit(readHookInput());
}
