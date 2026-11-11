'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Trans } from '@lingui/react/macro';
import RepositoryCard from '@/components/dashboard/repository-card';
import Spinner from '@/components/shared/spinner';
import { loadDashboardRepositories } from '@/lib/actions/repositories';
import type { DashboardRepositoryPage } from '@/lib/dashboard/queries';

// 목록 끝이 화면 아래 이만큼 가까워지면 미리 다음 페이지 요청
const PRELOAD_MARGIN = '400px';

type LoadState = 'idle' | 'loading' | 'error';

interface RepositoryListProps {
  // 서버에서 렌더링한 첫 페이지
  initialPage: DashboardRepositoryPage;
}

/**
 * 연동 저장소 카드 목록 (무한 스크롤)
 * - 목록 끝의 감시 요소가 화면에 가까워지면 커서로 다음 페이지를 불러와 이어 붙임
 * - 실패하면 다시 시도 버튼 표시 (자동으로 반복 요청하지 않음)
 */
const RepositoryList = ({ initialPage }: RepositoryListProps) => {
  const [repositories, setRepositories] = useState(initialPage.repositories);
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
      const page = await loadDashboardRepositories(nextCursor);

      setRepositories((previous) => {
        // 커서 기반이라 겹치지 않지만, 다른 탭에서 다시 연동해 순서가 바뀐 경우에 대비해 중복 제거
        const loadedIds = new Set(previous.map(({ id }) => id));

        return [
          ...previous,
          ...page.repositories.filter(({ id }) => !loadedIds.has(id)),
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
      <ul className="grid grid-cols-1 gap-4 pc:grid-cols-2 pc:gap-6">
        {repositories.map((repository) => (
          <li key={repository.id} className="flex flex-col">
            <RepositoryCard repository={repository} />
          </li>
        ))}
      </ul>
      {nextCursor && (
        <div
          ref={sentinelRef}
          className="flex min-h-11 items-center justify-center text-[13px] leading-[1.6] text-ink-muted"
        >
          {loadState === 'loading' && (
            <Spinner label={<Trans>저장소를 더 불러오는 중...</Trans>} />
          )}
          {loadState === 'error' && (
            <p role="alert" className="text-danger">
              <Trans>저장소 목록을 불러오지 못했습니다.</Trans>{' '}
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

export default RepositoryList;
