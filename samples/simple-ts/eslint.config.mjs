import js from '@eslint/js';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default defineConfig([
  globalIgnores([
    'node_modules/*',
    'dist/*coverage/*',
    '**/*.d.ts',
    'src/types/',
    '!**/.eslintrc.js',
  ]),
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
        project: './tsconfig.json',
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

      '@typescript-eslint/no-misused-promises': ['off'],
      '@typescript-eslint/prefer-namespace-keyword': 'off',
    },
  },
]);
