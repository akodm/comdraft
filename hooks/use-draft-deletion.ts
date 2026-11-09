import { useCallback, useState } from 'react';
import { useStudio } from '@/components/studio/studio-context';
import { useLocalizedRouter } from '@/hooks/use-localized-router';
import { deleteDraft } from '@/lib/actions/studio';

interface DraftListEntry {
  id: string;
}

/**
 * 초안 목록에서 다음으로 열 초안 (삭제한 초안 바로 아래, 없으면 바로 위, 둘 다 없으면 null)
 */
export const getNextDraftId = (
  drafts: DraftListEntry[],
  removedDraftId: string,
): string | null => {
  const index = drafts.findIndex(({ id }) => id === removedDraftId);

  if (index === -1) {
    return null;
  }

  return drafts[index + 1]?.id ?? drafts[index - 1]?.id ?? null;
};

/**
 * 초안 삭제 흐름
 * 1. 목록에서 먼저 숨기고(남은 자동 저장도 멈춤) 서버에 삭제 요청
 * 2. 열려 있던 초안이면 목록의 다음 초안으로, 남은 초안이 없으면 새 초안 화면으로 이동
 * 3. 실패하거나 AI 작성 중이라 지울 수 없으면 목록에 다시 보이고 사유 표시
 */
export const useDraftDeletion = (
  drafts: DraftListEntry[],
  activeDraftId: string | undefined,
) => {
  const router = useLocalizedRouter();
  const { repository, basePath, markDraftRemoved, unmarkDraftRemoved } =
    useStudio();
  const [error, setError] = useState<'locked' | 'failed' | null>(null);

  const removeDraft = useCallback(
    async (draftId: string) => {
      const nextDraftId = getNextDraftId(drafts, draftId);

      setError(null);
      markDraftRemoved(draftId);

      try {
        const result = await deleteDraft(repository.id, draftId);

        if (result.status === 'locked') {
          unmarkDraftRemoved(draftId);
          setError('locked');
          return;
        }

        // 이미 삭제된 초안(not_found)도 목록에서 숨긴 상태로 둠
        if (result.status === 'deleted' && draftId === activeDraftId) {
          router.replace(nextDraftId ? `${basePath}/${nextDraftId}` : basePath);
        }
      } catch {
        unmarkDraftRemoved(draftId);
        setError('failed');
      }
    },
    [
      drafts,
      activeDraftId,
      repository.id,
      basePath,
      router,
      markDraftRemoved,
      unmarkDraftRemoved,
    ],
  );

  return { removeDraft, error };
};
