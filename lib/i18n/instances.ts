import 'server-only';
import { setupI18n, type I18n, type Messages } from '@lingui/core';
import { LOCALES, type Locale } from '@/lib/i18n/config';
import { messages as enMessages } from '@/locales/en';
import { messages as koMessages } from '@/locales/ko';

/**
 * 로케일별 서버 I18n 인스턴스
 * - next/root-params 를 쓰지 않아 Server Action 에서도 import 할 수 있음 (lib/i18n/server.ts 는 Server Component 용)
 */

// lingui compile 로 생성된 카탈로그 (pnpm i18n:extract → 번역 → pnpm i18n:compile)
const CATALOGS: Record<Locale, Messages> = {
  ko: koMessages,
  en: enMessages,
};

// 서버는 여러 로케일 요청을 동시에 처리하므로 하나의 인스턴스를 activate 로 바꿔 쓰면 안 됨
const I18N_INSTANCES = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    setupI18n({ locale, messages: { [locale]: CATALOGS[locale] } }),
  ]),
) as Record<Locale, I18n>;

export const getI18nInstance = (locale: Locale) => I18N_INSTANCES[locale];
