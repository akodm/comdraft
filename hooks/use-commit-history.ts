import { useCallback, useEffect, useRef, useState } from 'react';
import { loadStudioCommits, type StudioCommit } from '@/lib/actions/studio';

export type CommitHistoryState =
  | 'idle'
  | 'loading'
  // 요청 실패 (다시 시도 가능)
  | 'error'
  // GitHub 토큰 만료 → 다시 로그인 필요
  | 'github_reauth'
  // 저장소에 접근할 수 없음 (권한 해제 등)
  | 'unavailable';

export interface CommitHistory {
  commits: StudioCommit[];
  state: CommitHistoryState;
  // 다음 페이지가 남아 있는지 (GitHub Link 헤더 기준)
  hasMore: boolean;
  loadMore: () => Promise<void>;
}

/**
 * 스튜디오 커밋 내역 (30개씩 무한 스크롤)
 * - 처음 열릴 때 첫 페이지를 불러오고, 이후에는 목록 끝에서 loadMore 호출
 * - 커밋은 서버에 저장하지 않고 매번 GitHub API 로 조회
 */
export const useCommitHistory = (repositoryId: string): CommitHistory => {
  const [commits, setCommits] = useState<StudioCommit[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(1);
  const [state, setState] = useState<CommitHistoryState>('idle');
  // 같은 페이지를 중복 요청하지 않도록 진행 중인 요청을 동기적으로 표시
  const isLoadingRef = useRef(false);
  const hasStartedRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (nextPage === null || isLoadingRef.current) {
      return;
    }

    isLoadingRef.current = true;
    setState('loading');

    try {
      const result = await loadStudioCommits(repositoryId, nextPage);

      if (result.status !== 'ok') {
        setState(result.status);
        return;
      }

      setCommits((previous) => {
        // 페이지 사이에 새 커밋이 푸시되면 같은 커밋이 다음 페이지에 다시 올 수 있어 중복 제거
        const loadedShas = new Set(previous.map(({ sha }) => sha));

        return [
          ...previous,
          ...result.commits.filter(({ sha }) => !loadedShas.has(sha)),
        ];
      });
      setNextPage(result.hasNextPage ? nextPage + 1 : null);
      setState('idle');
    } catch {
      setState('error');
    } finally {
      isLoadingRef.current = false;
    }
  }, [repositoryId, nextPage]);

  // 스튜디오가 열리면 첫 페이지 조회 (이후 페이지는 스크롤로 요청)
  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    void loadMore();
  }, [loadMore]);

  return {
    commits,
    state,
    hasMore:
      nextPage !== null && state !== 'github_reauth' && state !== 'unavailable',
    loadMore,
  };
};
