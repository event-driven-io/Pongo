import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default [
  {
    ignores: [
      '.wrangler/',
      'coverage/',
      'dist/',
      'node_modules/',
      '**/*.d.ts',
      'eslint.config.mjs',
    ],
  },
  js.configs.recommended,
  ...typescriptEslint.configs['flat/recommended'],
  ...typescriptEslint.configs['flat/recommended-type-checked'],
  prettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.worker,
      },
      parserOptions: {
        project: './tsconfig.json',
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
      '@typescript-eslint/no-misused-promises': 'off',
      '@typescript-eslint/prefer-namespace-keyword': 'off',
    },
  },
];
