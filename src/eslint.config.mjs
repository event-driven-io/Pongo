import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default [
  {
    ignores: [
      'vitest.config.ts',
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
  js.configs.recommended,
  ...typescriptEslint.configs['flat/recommended'],
  ...typescriptEslint.configs['flat/recommended-type-checked'],
  prettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },

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
];
