import { useCallback, useMemo, useRef, useState } from 'react';

export interface RemovedDrafts {
  // 화면에서 숨길 초안 (렌더링용)
  removedDraftIds: ReadonlySet<string>;
  markDraftRemoved: (draftId: string) => void;
  // 삭제에 실패하면 다시 보이게 함
  unmarkDraftRemoved: (draftId: string) => void;
  // 자동 저장처럼 렌더링 밖(타이머, 정리 함수)에서 최신 값을 확인할 때 사용
  isDraftRemoved: (draftId: string) => boolean;
}

/**
 * 삭제한(또는 삭제 중인) 초안 목록
 * - 서버 목록을 다시 불러오지 않고 사이드바에서 바로 숨김
 * - 삭제 요청을 보내기 전에 표시해 두면, 그 초안의 남은 자동 저장이 실행되지 않음
 */
export const useRemovedDrafts = (): RemovedDrafts => {
  const [removedDraftIds, setRemovedDraftIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const removedRef = useRef(new Set<string>());

  const update = useCallback((draftId: string, isRemoved: boolean) => {
    const next = new Set(removedRef.current);

    if (isRemoved) {
      next.add(draftId);
    } else {
      next.delete(draftId);
    }

    removedRef.current = next;
    setRemovedDraftIds(next);
  }, []);

  const markDraftRemoved = useCallback(
    (draftId: string) => update(draftId, true),
    [update],
  );
  const unmarkDraftRemoved = useCallback(
    (draftId: string) => update(draftId, false),
    [update],
  );
  const isDraftRemoved = useCallback(
    (draftId: string) => removedRef.current.has(draftId),
    [],
  );

  return useMemo(
    () => ({
      removedDraftIds,
      markDraftRemoved,
      unmarkDraftRemoved,
      isDraftRemoved,
    }),
    [removedDraftIds, markDraftRemoved, unmarkDraftRemoved, isDraftRemoved],
  );
};
