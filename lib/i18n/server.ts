import 'server-only';
import { setI18n } from '@lingui/react/server';
import { notFound } from 'next/navigation';
import { lang } from 'next/root-params';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { getI18nInstance } from '@/lib/i18n/instances';

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
