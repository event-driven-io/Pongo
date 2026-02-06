import { FlatCompat } from '@eslint/eslintrc';
import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier';
import globals from 'globals';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

export default [
  {
    ignores: [
      '**/dist/',
      '**/lib/',
      '**/cache/',
      'node_modules/*',
      '**/node_modules',
      'dist/*coverage/*',
      'dist/*',
      'lib/*',
      '**/dist/*',
      '**/dist',
      '**/*.d.ts',
      'src/types/',
      'eslint.config.mjs',
      'e2e/*',
    ],
  },
  ...compat.extends(
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:prettier/recommended',
  ),
  {
    plugins: {
      '@typescript-eslint': typescriptEslint,
    },

    languageOptions: {
      globals: {
        ...globals.node,
      },

      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',

      parserOptions: {
        project: './tsconfig.eslint.json',
      },
    },

    settings: {
      'import/resolver': {
        typescript: {},
      },
    },

    rules: {
      'no-unused-vars': 'off',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          varsIgnorePattern: '^_',
          argsIgnorePattern: '^_',
        },
      ],

      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          fixStyle: 'separate-type-imports',
        },
      ],
      '@typescript-eslint/no-import-type-side-effects': 'error',

      '@typescript-eslint/no-misused-promises': ['off'],
      '@typescript-eslint/prefer-namespace-keyword': 'off',
    },
  },
  {
    files: ['packages/dumbo/src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '../storage/all',
              importNames: ['dumbo', 'parseConnectionString'],
              message:
                'Core cannot import implementation from storage/all. Use the registry pattern instead.',
            },
          ],
          patterns: [
            {
              group: ['../storage/postgresql/**', '../storage/sqlite/**'],
              message:
                'Core cannot import from storage implementations. Use the registry pattern instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/dumbo/src/storage/postgresql/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../sqlite/**', '../../sqlite/**'],
              message: 'PostgreSQL storage cannot import from SQLite storage.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/dumbo/src/storage/sqlite/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../postgresql/**', '../../postgresql/**'],
              message: 'SQLite storage cannot import from PostgreSQL storage.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/pongo/src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['../storage/**', '../../storage/**'],
              message:
                'Pongo core cannot import from storage implementations. Use dependency injection or registry pattern instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/pongo/src/storage/postgresql/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['../sqlite/**', '../../sqlite/**'],
              message: 'PostgreSQL storage cannot import from SQLite storage.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/pongo/src/storage/sqlite/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['../postgresql/**', '../../postgresql/**'],
              message: 'SQLite storage cannot import from PostgreSQL storage.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['packages/pongo/src/mongo/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'warn',
        {
          patterns: [
            {
              group: ['../storage/**', '../../storage/**'],
              message:
                'Mongo compatibility layer cannot import from storage implementations.',
            },
          ],
        },
      ],
    },
  },
  eslintConfigPrettier,
];
