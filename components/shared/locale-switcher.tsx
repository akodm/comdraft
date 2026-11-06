'use client';

import { useLingui } from '@lingui/react/macro';
import LocalizedLink from '@/components/shared/localized-link';
import { useLocale } from '@/hooks/use-locale';
import { useLocalizedPathname } from '@/hooks/use-localized-pathname';
import { LOCALE_LABELS, LOCALES } from '@/lib/i18n/config';

/**
 * 현재 경로를 유지한 채 로케일 세그먼트만 바꾸는 언어 전환 링크
 * - 서버 렌더링 결과가 로케일별로 달라지므로 클라이언트에서 activate 하지 않고 URL 을 이동
 */
const LocaleSwitcher = () => {
  const { t } = useLingui();
  const currentLocale = useLocale();
  const path = useLocalizedPathname();

  return (
    <nav aria-label={t`언어 선택`} className="flex gap-2 text-sm">
      {LOCALES.map((locale) => {
        const isCurrent = currentLocale === locale;

        return (
          <LocalizedLink
            key={locale}
            href={path}
            locale={locale}
            hrefLang={locale}
            lang={locale}
            aria-current={isCurrent ? 'true' : undefined}
            className={
              isCurrent ? 'font-semibold' : 'text-gray-500 hover:underline'
            }
          >
            {LOCALE_LABELS[locale]}
          </LocalizedLink>
        );
      })}
    </nav>
  );
};

export default LocaleSwitcher;
