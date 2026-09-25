import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import pluginReact from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxa11y from 'eslint-plugin-jsx-a11y';
import prettier from 'eslint-plugin-prettier';
import noRelativeImportPaths from 'eslint-plugin-no-relative-import-paths';
import { defineConfig, globalIgnores } from 'eslint/config';

export default defineConfig(
  globalIgnores([
    'node_modules',
    'dist',
    '*.config.{js,mjs}',
    '**/.next',
    '*sitemap.{js,mjs}',
    '**/*.d.ts',
    '**/*.txt',
    '**/*.md',
  ]),
  eslint.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.stylistic,
  pluginReact.configs.flat.recommended,
  pluginReact.configs.flat['jsx-runtime'],
  reactHooks.configs['recommended-latest'],
  jsxa11y.flatConfigs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      'no-nested-ternary': 'error',
      'no-unneeded-ternary': 'error',
      'no-implicit-coercion': 'error',
      'react/react-in-jsx-scope': 'off',
      '@typescript-eslint/no-empty-function': 'off',
      'react/display-name': 'off',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/array-type': [
        'error',
        {
          default: 'array-simple',
          readonly: 'array-simple',
        },
      ],
    },
  },
  {
    plugins: {
      'no-relative-import-paths': noRelativeImportPaths,
      prettier: prettier,
    },
    rules: {
      'no-relative-import-paths/no-relative-import-paths': 'error',
      'prettier/prettier': 'error',
    },
  },
  {
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
);
