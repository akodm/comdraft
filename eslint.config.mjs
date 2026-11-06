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
    // 다국어 라우팅: 로케일 접두사 없이 이동하면 proxy 가 쿠키/Accept-Language 로 로케일을 다시 골라
    // 리다이렉트가 한 번 더 생기고 현재 언어가 바뀔 수 있으므로, 로케일을 유지하는 래퍼만 사용
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'next/link',
              message:
                '로케일이 유지되도록 @/components/shared/localized-link 를 사용하세요.',
            },
            {
              name: 'next/navigation',
              importNames: ['useRouter', 'redirect', 'permanentRedirect'],
              message:
                '로케일이 유지되도록 useLocalizedRouter(@/hooks/use-localized-router) 또는 localizedRedirect(@/lib/i18n/request) 를 사용하세요.',
            },
          ],
        },
      ],
      // <a href="/dashboard"> 처럼 앱 내부 경로를 직접 쓰는 경우 (/api, //외부 주소는 허용)
      // esquery 정규식 안에서는 "/" 를 쓸 수 없어 / 로 표기
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXOpeningElement[name.name='a'] > JSXAttribute[name.name='href'] Literal[value=/^\\u002F(?!\\u002F|api(\\u002F|$)|_next\\u002F|_vercel\\u002F)/]",
          message:
            '앱 내부 경로는 LocalizedLink 또는 LocalizedAnchor 를 사용하세요.',
        },
        {
          selector:
            "JSXOpeningElement[name.name='a'] > JSXAttribute[name.name='href'] TemplateElement[value.raw=/^\\u002F(?!\\u002F|api(\\u002F|$)|_next\\u002F|_vercel\\u002F)/]",
          message:
            '앱 내부 경로는 LocalizedLink 또는 LocalizedAnchor 를 사용하세요.',
        },
      ],
    },
  },
  {
    // 로케일 리다이렉트 구현부 (redirect 를 감싸는 유일한 곳)
    files: ['lib/i18n/request.ts'],
    rules: {
      'no-restricted-imports': 'off',
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
