import { useLingui } from '@lingui/react';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/lib/i18n/config';

// Client Component 에서 현재 로케일 조회 (LinguiClientProvider 의 활성 로케일)
export const useLocale = (): Locale => {
  const { i18n } = useLingui();

  return isLocale(i18n.locale) ? i18n.locale : DEFAULT_LOCALE;
};
