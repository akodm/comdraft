'use client';

import type { ComponentProps } from 'react';
// 로케일 처리를 위해 이 파일에서만 next/link 를 직접 사용 (나머지는 eslint 로 제한)
// eslint-disable-next-line no-restricted-imports
import Link from 'next/link';
import { useLocale } from '@/hooks/use-locale';
import { localizeHref, type Locale } from '@/lib/i18n/config';

type NextLinkProps = ComponentProps<typeof Link>;

interface LocalizedLinkProps extends Omit<NextLinkProps, 'locale'> {
  // 지정하면 해당 로케일로 이동 (이미 접두사가 있는 href 도 교체), 생략하면 현재 로케일 유지
  locale?: Locale;
}

/**
 * 현재 로케일을 유지하는 next/link
 * - href 는 로케일 접두사 없이 작성 (`/dashboard` → `/ko/dashboard`)
 * - 접두사가 없으면 proxy 가 쿠키/Accept-Language 로 로케일을 다시 고르면서
 *   리다이렉트가 한 번 더 생기고, 다른 탭에서 바꾼 언어로 넘어갈 수 있으므로 링크 단계에서 붙여서 이동
 * - /api, 정적 파일, 외부 URL 은 그대로 이동
 * - Server Component 에서도 사용 가능 (LinguiClientProvider 의 로케일을 사용)
 */
const LocalizedLink = ({ href, locale, ...props }: LocalizedLinkProps) => {
  const currentLocale = useLocale();
  const targetLocale = locale ?? currentLocale;
  const options = { override: locale !== undefined };

  const localizedHref: NextLinkProps['href'] =
    typeof href === 'string'
      ? localizeHref(href, targetLocale, options)
      : {
          ...href,
          pathname: href.pathname
            ? localizeHref(href.pathname, targetLocale, options)
            : href.pathname,
        };

  return <Link href={localizedHref} {...props} />;
};

export default LocalizedLink;
