import { defineConfig } from '@lingui/cli';
// Lingui CLI 가 직접 로드하는 파일이라 tsconfig 경로 별칭(@/) 대신 상대 경로 사용
// eslint-disable-next-line no-relative-import-paths/no-relative-import-paths
import { DEFAULT_LOCALE, LOCALES } from './lib/i18n/config';

export default defineConfig({
  locales: [...LOCALES],
  // 원문(메시지 ID)은 한국어, 번역이 없으면 한국어 원문으로 대체
  sourceLocale: DEFAULT_LOCALE,
  fallbackLocales: {
    default: DEFAULT_LOCALE,
  },
  orderBy: 'messageId',
  catalogs: [
    {
      path: '<rootDir>/locales/{locale}',
      include: ['<rootDir>/app', '<rootDir>/components', '<rootDir>/lib'],
    },
  ],
  // lingui compile 결과를 TypeScript 모듈(locales/{locale}.ts)로 생성
  compileNamespace: 'ts',
});
