import { Linter } from 'eslint';
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, it } from 'vitest';

type RestrictedSyntaxOption = {
  selector: string;
  message: string;
};

type EslintConfigEntry = {
  files?: ReadonlyArray<string>;
  ignores?: ReadonlyArray<string>;
  rules?: Record<string, unknown>;
};

const rawErrorMessageFragment = 'not a raw Error';
const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);

const loadEslintConfigEntries = async (): Promise<EslintConfigEntry[]> => {
  const config = (await import(
    pathToFileURL(path.join(repoRoot, 'eslint.config.mjs')).href
  )) as { default: unknown };

  return config.default as EslintConfigEntry[];
};

const noRestrictedSyntaxOptionsFor = async (
  files: ReadonlyArray<string>,
): Promise<{
  ignores: ReadonlyArray<string>;
  options: ReadonlyArray<RestrictedSyntaxOption>;
}> => {
  const eslintConfigEntries = await loadEslintConfigEntries();
  const config = eslintConfigEntries.find(
    (entry) =>
      Array.isArray(entry.files) &&
      entry.files.length === files.length &&
      entry.files.every((file, index) => file === files[index]),
  );
  assert.ok(config, `Expected ESLint config for ${files.join(', ')}`);

  const rule = config.rules?.['no-restricted-syntax'];
  assert.ok(Array.isArray(rule), 'Expected no-restricted-syntax rule');
  assert.strictEqual(rule[0], 'error');

  return {
    ignores: config.ignores ?? [],
    options: rule.slice(1) as RestrictedSyntaxOption[],
  };
};

const lintWithRestrictedSyntax = (
  code: string,
  options: ReadonlyArray<RestrictedSyntaxOption>,
) => {
  const linter = new Linter();

  return linter.verify(code, {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-restricted-syntax': ['error', ...options],
    },
  });
};

const assertRestrictedSyntaxMessage = (
  messages: ReadonlyArray<{ ruleId: string | null; message: string }>,
  fragment: string,
): void => {
  assert.ok(
    messages.some(
      ({ ruleId, message }) =>
        ruleId === 'no-restricted-syntax' && message.includes(fragment),
    ),
    `Expected no-restricted-syntax message containing "${fragment}". Got: ${JSON.stringify(
      messages,
    )}`,
  );
};

describe('Dumbo ESLint raw error restrictions', () => {
  it('rejects raw Error constructors in production code', async () => {
    const dumboRules = await noRestrictedSyntaxOptionsFor([
      'packages/dumbo/src/**/*.ts',
    ]);
    const messages = lintWithRestrictedSyntax(
      `export const probe = () => {
  throw new Error('probe');
};
`,
      dumboRules.options,
    );

    assertRestrictedSyntaxMessage(messages, rawErrorMessageFragment);
  });

  it('rejects raw Error calls in production code', async () => {
    const dumboRules = await noRestrictedSyntaxOptionsFor([
      'packages/dumbo/src/**/*.ts',
    ]);
    const messages = lintWithRestrictedSyntax(
      `export const probe = () => {
  throw Error('probe');
};
`,
      dumboRules.options,
    );

    assertRestrictedSyntaxMessage(messages, rawErrorMessageFragment);
  });

  it('leaves raw Error test doubles outside the production restriction', async () => {
    const dumboRules = await noRestrictedSyntaxOptionsFor([
      'packages/dumbo/src/**/*.ts',
    ]);

    assert.ok(dumboRules.ignores.includes('packages/**/*.spec.ts'));
  });
});
