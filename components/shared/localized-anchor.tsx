'use client';

import type { ComponentProps } from 'react';
import { useLocale } from '@/hooks/use-locale';
import { localizeHref, type Locale } from '@/lib/i18n/config';

interface LocalizedAnchorProps extends ComponentProps<'a'> {
  href: string;
  // 지정하면 해당 로케일로 이동 (이미 접두사가 있는 href 도 교체), 생략하면 현재 로케일 유지
  locale?: Locale;
}

/**
 * 현재 로케일을 유지하는 <a>
 * - 클라이언트 라우팅 대신 전체 페이지 이동이 필요한 앱 내부 링크에 사용 (그 외 내부 이동은 LocalizedLink)
 * - /api(예: /api/github/install), 정적 파일, 외부 URL 은 접두사 없이 그대로 이동하므로
 *   일반 <a> 대신 써도 안전
 */
const LocalizedAnchor = ({
  href,
  locale,
  children,
  ...props
}: LocalizedAnchorProps) => {
  const currentLocale = useLocale();
  const localizedHref = localizeHref(href, locale ?? currentLocale, {
    override: locale !== undefined,
  });

  return (
    <a href={localizedHref} {...props}>
      {children}
    </a>
  );
};

export default LocalizedAnchor;
