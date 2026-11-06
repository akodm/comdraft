import 'server-only';
import { setupI18n, type I18n, type Messages } from '@lingui/core';
import { setI18n } from '@lingui/react/server';
import { notFound } from 'next/navigation';
import { lang } from 'next/root-params';
import { isLocale, LOCALES, type Locale } from '@/lib/i18n/config';
import { messages as enMessages } from '@/locales/en';
import { messages as koMessages } from '@/locales/ko';

// lingui compile 로 생성된 카탈로그 (pnpm i18n:extract → 번역 → pnpm i18n:compile)
const CATALOGS: Record<Locale, Messages> = {
  ko: koMessages,
  en: enMessages,
};

// 로케일별 I18n 인스턴스
// 서버는 여러 로케일 요청을 동시에 처리하므로 하나의 인스턴스를 activate 로 바꿔 쓰면 안 됨
const I18N_INSTANCES = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    setupI18n({ locale, messages: { [locale]: CATALOGS[locale] } }),
  ]),
) as Record<Locale, I18n>;

export const getI18nInstance = (locale: Locale) => I18N_INSTANCES[locale];

// [lang] 루트 세그먼트의 로케일 (Server Component 전용)
export const getLocale = async (): Promise<Locale> => {
  const locale = await lang();

  // proxy 와 dynamicParams = false 로 걸러지지만 안전장치로 한 번 더 확인
  if (!isLocale(locale)) {
    notFound();
  }

  return locale;
};

/**
 * [lang] 루트 세그먼트의 로케일로 현재 요청의 Server Component 용 i18n 설정
 * - layout 과 page 는 병렬로 렌더링될 수 있으므로 모든 layout/page(및 generateMetadata) 상단에서 호출
 * - next/root-params 는 Server Component 에서만 동작 → Server Action/Route Handler 는 lib/i18n/request 사용
 */
export const initLingui = async () => {
  const i18n = getI18nInstance(await getLocale());

  setI18n(i18n);

  return i18n;
};
