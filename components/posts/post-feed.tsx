'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Trans } from '@lingui/react/macro';
import PostCard from '@/components/posts/post-card';
import Spinner from '@/components/shared/spinner';
import { loadPostFeed } from '@/lib/actions/posts';
import type { Locale } from '@/lib/i18n/config';
import type { PostFeedPage } from '@/lib/posts/queries';

// 목록 끝이 화면 아래 이만큼 가까워지면 미리 다음 페이지 요청
const PRELOAD_MARGIN = '400px';

type LoadState = 'idle' | 'loading' | 'error';

interface PostFeedProps {
  // 서버에서 렌더링한 첫 페이지
  initialPage: PostFeedPage;
  locale: Locale;
}

/**
 * 전체 피드 게시글 목록 (무한 스크롤)
 * - 목록 끝의 감시 요소가 화면에 가까워지면 커서로 다음 페이지를 불러와 이어 붙임
 * - 실패하면 다시 시도 버튼 표시 (자동으로 반복 요청하지 않음)
 */
const PostFeed = ({ initialPage, locale }: PostFeedProps) => {
  const [posts, setPosts] = useState(initialPage.posts);
  const [nextCursor, setNextCursor] = useState(initialPage.nextCursor);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const sentinelRef = useRef<HTMLDivElement>(null);
  // 같은 커서로 중복 요청하지 않도록 진행 중인 요청을 동기적으로 표시
  const isLoadingRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (!nextCursor || isLoadingRef.current) {
      return;
    }

    isLoadingRef.current = true;
    setLoadState('loading');

    try {
      const page = await loadPostFeed(nextCursor);

      setPosts((previous) => {
        // 커서 기반이라 겹치지 않지만 만일에 대비해 중복 제거
        const loadedIds = new Set(previous.map(({ id }) => id));

        return [
          ...previous,
          ...page.posts.filter(({ id }) => !loadedIds.has(id)),
        ];
      });
      setNextCursor(page.nextCursor);
      setLoadState('idle');
    } catch {
      setLoadState('error');
    } finally {
      isLoadingRef.current = false;
    }
  }, [nextCursor]);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !nextCursor || loadState === 'error') {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: `0px 0px ${PRELOAD_MARGIN} 0px` },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [nextCursor, loadState, loadMore]);

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-4 pc:gap-6">
        {posts.map((post) => (
          <li key={post.id} className="flex flex-col">
            <PostCard post={post} locale={locale} />
          </li>
        ))}
      </ul>
      {nextCursor && (
        <div
          ref={sentinelRef}
          className="flex min-h-11 items-center justify-center text-[13px] leading-[1.6] text-ink-muted"
        >
          {loadState === 'loading' && (
            <Spinner label={<Trans>글을 더 불러오는 중...</Trans>} />
          )}
          {loadState === 'error' && (
            <p role="alert" className="text-danger">
              <Trans>글 목록을 불러오지 못했습니다.</Trans>{' '}
              <button
                type="button"
                onClick={() => void loadMore()}
                className="underline"
              >
                <Trans>다시 시도</Trans>
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default PostFeed;
