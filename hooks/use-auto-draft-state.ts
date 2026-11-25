import { useCallback, useEffect, useRef, useState } from 'react';
import {
  excludeAutoDraftCommit,
  loadAutoDraftState,
  restoreAutoDraftCommit,
  setAutoDraftAnchor,
  type AutoDraftCommitActionResult,
  type AutoDraftStateResult,
} from '@/lib/actions/auto-draft';

export type AutoDraftCommitAction = 'anchor' | 'exclude' | 'restore';

export interface AutoDraftState {
  // 아직 불러오기 전이면 null
  state: AutoDraftStateResult | null;
  // 커밋 동작을 처리하는 중 (메뉴 항목 비활성화용)
  isPending: boolean;
  // 마지막 커밋 동작이 실패했는지
  hasActionError: boolean;
  refresh: () => Promise<void>;
  run: (action: AutoDraftCommitAction, sha: string) => Promise<void>;
}

const ACTIONS: Record<
  AutoDraftCommitAction,
  (repositoryId: string, sha: string) => Promise<AutoDraftCommitActionResult>
> = {
  anchor: setAutoDraftAnchor,
  exclude: excludeAutoDraftCommit,
  restore: restoreAutoDraftCommit,
};

/**
 * 스튜디오 커밋 목록의 자동 초안 상태 (기준점·자동 대상·제외 목록)
 * - 저장소·추적 브랜치가 바뀌면 다시 읽고, 커밋 동작 뒤에도 서버 값으로 다시 읽음
 * - 여러 요청이 겹치면 가장 나중에 보낸 응답만 반영
 */
export const useAutoDraftState = (
  repositoryId: string,
  branch: string,
): AutoDraftState => {
  const [state, setState] = useState<AutoDraftStateResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [hasActionError, setHasActionError] = useState(false);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;

    try {
      const result = await loadAutoDraftState(repositoryId);

      if (requestId === requestRef.current) setState(result);
    } catch {
      if (requestId === requestRef.current) setState({ status: 'error' });
    }
  }, [repositoryId]);

  useEffect(() => {
    // 브랜치가 바뀌면 경계도 새로 잡히므로 다시 읽음
    void refresh();
  }, [refresh, branch]);

  const run = useCallback(
    async (action: AutoDraftCommitAction, sha: string) => {
      setIsPending(true);
      setHasActionError(false);

      try {
        const result = await ACTIONS[action](repositoryId, sha);

        setHasActionError(result.status !== 'ok');
      } catch {
        setHasActionError(true);
      }

      await refresh();
      setIsPending(false);
    },
    [repositoryId, refresh],
  );

  return { state, isPending, hasActionError, refresh, run };
};
