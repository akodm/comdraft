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

interface LoadedCommits {
  // 어떤 저장소·브랜치의 내역인지 (바뀌면 처음부터 다시 불러옴)
  key: string;
  commits: StudioCommit[];
  nextPage: number | null;
  state: CommitHistoryState;
}

const emptyHistory = (key: string): LoadedCommits => ({
  key,
  commits: [],
  nextPage: 1,
  state: 'idle',
});

/**
 * 스튜디오 커밋 내역 (30개씩 무한 스크롤)
 * - 처음 열릴 때 첫 페이지를 불러오고, 이후에는 목록 끝에서 loadMore 호출
 * - 저장소 설정에서 연동 브랜치를 바꾸면 비우고 첫 페이지부터 다시 불러옴
 *   (바뀌기 전에 보낸 요청의 응답은 버림)
 * - 커밋은 서버에 저장하지 않고 매번 GitHub API 로 조회 (서버가 저장된 연동 브랜치로 조회)
 */
export const useCommitHistory = (
  repositoryId: string,
  branch: string,
): CommitHistory => {
  const key = `${repositoryId}:${branch}`;
  const [loaded, setLoaded] = useState<LoadedCommits>(() => emptyHistory(key));
  // 같은 페이지를 중복 요청하지 않도록 진행 중인 요청을 동기적으로 표시 (내역 key 별)
  const loadingKeyRef = useRef<string | null>(null);

  // 브랜치가 바뀌면 렌더링 중에 바로 비움 (이전 브랜치 커밋이 잠깐이라도 보이지 않게)
  if (loaded.key !== key) {
    setLoaded(emptyHistory(key));
  }

  const current = loaded.key === key ? loaded : emptyHistory(key);
  const { nextPage } = current;

  const loadMore = useCallback(async () => {
    if (nextPage === null || loadingKeyRef.current === key) {
      return;
    }

    loadingKeyRef.current = key;
    setLoaded((previous) =>
      previous.key === key ? { ...previous, state: 'loading' } : previous,
    );

    try {
      const result = await loadStudioCommits(repositoryId, nextPage);

      setLoaded((previous) => {
        // 그 사이 브랜치가 바뀌었으면 이전 브랜치 응답은 버림
        if (previous.key !== key) {
          return previous;
        }

        if (result.status !== 'ok') {
          return { ...previous, state: result.status };
        }

        // 페이지 사이에 새 커밋이 푸시되면 같은 커밋이 다음 페이지에 다시 올 수 있어 중복 제거
        const loadedShas = new Set(previous.commits.map(({ sha }) => sha));

        return {
          ...previous,
          commits: [
            ...previous.commits,
            ...result.commits.filter(({ sha }) => !loadedShas.has(sha)),
          ],
          nextPage: result.hasNextPage ? nextPage + 1 : null,
          state: 'idle',
        };
      });
    } catch {
      setLoaded((previous) =>
        previous.key === key ? { ...previous, state: 'error' } : previous,
      );
    } finally {
      if (loadingKeyRef.current === key) {
        loadingKeyRef.current = null;
      }
    }
  }, [repositoryId, key, nextPage]);

  // 스튜디오가 열리거나 브랜치가 바뀌면 첫 페이지 조회 (이후 페이지는 스크롤로 요청)
  const startedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (startedKeyRef.current === key) {
      return;
    }

    startedKeyRef.current = key;
    void loadMore();
  }, [key, loadMore]);

  return {
    commits: current.commits,
    state: current.state,
    hasMore:
      current.nextPage !== null &&
      current.state !== 'github_reauth' &&
      current.state !== 'unavailable',
    loadMore,
  };
};
