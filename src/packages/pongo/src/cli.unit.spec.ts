import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import program from './cli';

const execFileAsync = promisify(execFile);

const runNode = (nodeArgs: string[], args: string[]) =>
  execFileAsync(process.execPath, ['--import', 'tsx', ...nodeArgs, ...args], {
    cwd: import.meta.dirname,
  });

describe('cli module', () => {
  it('exports the configured program', () => {
    expect(program.name()).toBe('pongo');
    expect(program.commands.map((command) => command.name())).toEqual(
      expect.arrayContaining(['config', 'migrate', 'shell']),
    );
  });

  // Importing the module used to call `program.parse(process.argv)` at top
  // level, which ran the CLI inside whatever process imported Pongo.
  // See https://github.com/event-driven-io/Pongo/issues/193
  it('does not parse argv on import', async () => {
    const { stdout } = await runNode(
      [
        '--input-type=module',
        '--eval',
        `await import('./cli.ts'); console.log('imported');`,
        '--',
      ],
      ['migrate', 'sql', '--collection', 'users'],
    );

    expect(stdout.trim()).toBe('imported');
  });

  it('parses argv when invoked through the bin entry', async () => {
    const { stdout } = await runNode(['./bin.ts'], ['--help']);

    expect(stdout).toContain('Usage: pongo');
  });
});
