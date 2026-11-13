'use client';

import { Trans } from '@lingui/react/macro';
import LocalizedLink from '@/components/shared/localized-link';
import { useLocalizedPathname } from '@/hooks/use-localized-pathname';

/**
 * 헤더의 게시글 메뉴 (게시글 목록과 상세에서는 진한 글자색으로 현재 위치 표시)
 */
const PostsNavLink = () => {
  const path = useLocalizedPathname();
  const isCurrent = path === '/posts' || path.startsWith('/posts/');

  return (
    <LocalizedLink
      href="/posts"
      aria-current={isCurrent ? 'page' : undefined}
      className={`text-[15px] leading-[1.2] font-medium whitespace-nowrap ${
        isCurrent ? 'text-ink' : 'text-ink-muted hover:text-ink'
      }`}
    >
      <Trans>게시글</Trans>
    </LocalizedLink>
  );
};

export default PostsNavLink;
