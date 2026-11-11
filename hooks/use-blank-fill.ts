import { useCallback, useEffect, useRef, useState } from 'react';
import { useLingui } from '@lingui/react';
import type { Editor } from '@tiptap/react';
import {
  findBlankById,
  getBlankFillUi,
  replaceBlankWithParagraphs,
  setBlankFillUi,
  type BlankFillNotice,
} from '@/components/studio/draft-blank-fill';
import {
  BLANK_FILL_FAILED_MESSAGE,
  getBlankFillRequestMessage,
} from '@/components/studio/blank-fill-messages';
import type { BlankFillResult } from '@/hooks/use-generation-job';
import { useLocale } from '@/hooks/use-locale';
import { markFillApplied, requestBlankFill } from '@/lib/actions/generation';
import type { GenerationJobView } from '@/lib/generation/jobs';
import { getBlankFillLock } from '@/lib/studio/blank-fill-state';
import { getBlankAnswer } from '@/lib/studio/draft-blank';

interface UseBlankFillOptions {
  editor: Editor | null;
  repositoryId: string;
  draftId: string | null;
  // 이 초안의 AI 작업 (초안 작성·빈칸 채우기)
  job: GenerationJobView | null;
  // 완료한 빈칸 채우기 결과 (편집기가 아직 넣지 않음)
  fillResult: BlankFillResult | null;
  // 대기 중인 자동 저장을 바로 마침 (저장까지 끝났는지)
  saveNow: () => Promise<boolean>;
  onStarted: (job: GenerationJobView) => void;
  // 결과를 그 빈칸에 넣었음 (또는 빈칸이 없어 버림)
  onDone: (jobId: string) => void;
}

/**
 * 편집기 빈칸의 AI 로 다듬기
 * - 잠금: 요청을 보내는 중이거나 진행 중인(결과를 아직 넣지 않은) 빈칸 채우기의 빈칸만 편집기 플러그인 상태로 막고,
 *   AI 작업이 진행 중이면 다른 빈칸의 다듬기를 막음 (편집기 전체는 잠그지 않음)
 * - 요청: 서버가 최신 본문을 읽도록 자동 저장을 마친 뒤 requestBlankFill
 * - 결과: 그 빈칸만 트랜잭션으로 바꾸고, 그 본문이 저장된 뒤에 markFillApplied
 *   (먼저 남기면 저장 전에 탭을 닫을 때 결과를 잃음, 저장에 실패하면 다음 저장이 끝난 뒤 남김)
 *   빈칸이 사라졌으면 결과를 버리고 반영 표시만 남김
 * - 실패: 잠금을 풀고 답은 그대로 둔 채 그 빈칸에 안내
 */
export const useBlankFill = ({
  editor,
  repositoryId,
  draftId,
  job,
  fillResult,
  saveNow,
  onStarted,
  onDone,
}: UseBlankFillOptions) => {
  const { i18n } = useLingui();
  const locale = useLocale();
  // 자동 저장을 마치고 요청을 보내는 중인 빈칸
  const [pendingBlankId, setPendingBlankId] = useState<string | null>(null);
  // 요청을 보내지 못한 이유 (작업이 생기기 전)
  const [requestNotice, setRequestNotice] = useState<BlankFillNotice | null>(
    null,
  );
  // 결과를 넣었지만 아직 반영 표시를 남기지 못한 작업 (다음 저장이 끝나면 남김)
  const unmarkedJobIdsRef = useRef(new Set<string>());
  // 요청을 보내는 중 (화면 상태가 편집기에 반영되기 전에 다시 눌러도 한 번만 보냄)
  const requestingRef = useRef(false);
  // 이미 넣은 결과 (같은 결과를 두 번 넣지 않음)
  const appliedJobIdRef = useRef<string | null>(null);
  const { fillingBlankId, isBusy } = getBlankFillLock(job, pendingBlankId);
  const failureMessage = i18n._(BLANK_FILL_FAILED_MESSAGE);
  // 실패한 빈칸 채우기 작업 (화면을 다시 열었을 때 떠난 사이 실패한 작업 포함)
  const failedFillBlankId =
    job?.kind === 'fill' && job.status === 'failed' ? job.blankId : null;
  const notice =
    requestNotice ??
    (failedFillBlankId
      ? { blankId: failedFillBlankId, message: failureMessage }
      : null);
  const noticeBlankId = notice?.blankId ?? null;
  const noticeMessage = notice?.message ?? null;

  // 화면 상태를 편집기 플러그인에 넘김 (빈칸 노드 뷰가 다시 그려짐)
  useEffect(() => {
    if (editor && !editor.isDestroyed) {
      setBlankFillUi(editor, {
        fillingBlankId,
        isBusy,
        notice:
          noticeBlankId && noticeMessage
            ? { blankId: noticeBlankId, message: noticeMessage }
            : null,
      });
    }
  }, [editor, fillingBlankId, isBusy, noticeBlankId, noticeMessage]);

  const requestFill = useCallback(
    async (blankId: string) => {
      if (
        !editor ||
        editor.isDestroyed ||
        !draftId ||
        requestingRef.current ||
        getBlankFillUi(editor.state).isBusy
      ) {
        return;
      }

      const fail = (message: string) => {
        setPendingBlankId(null);
        setRequestNotice({ blankId, message });
      };

      requestingRef.current = true;
      setRequestNotice(null);
      setPendingBlankId(blankId);

      try {
        // 서버가 저장된 본문에서 빈칸을 찾으므로 입력한 답까지 먼저 저장
        if (!(await saveNow())) {
          fail(failureMessage);
          return;
        }

        const target = findBlankById(editor.state.doc, blankId);

        if (editor.isDestroyed || !target) {
          setPendingBlankId(null);
          return;
        }

        const result = await requestBlankFill({
          repositoryId,
          draftId,
          blankId,
          answer: getBlankAnswer(target.node.toJSON()),
        });

        if (result.status !== 'started') {
          fail(i18n._(getBlankFillRequestMessage(result, locale)));
          return;
        }

        // 작업이 생기면 그 작업이 빈칸을 막음
        onStarted(result.job);
        setPendingBlankId(null);
      } catch {
        fail(failureMessage);
      } finally {
        requestingRef.current = false;
      }
    },
    [
      editor,
      draftId,
      repositoryId,
      saveNow,
      onStarted,
      failureMessage,
      i18n,
      locale,
    ],
  );

  // 반영 표시 (실패하면 다음에 초안을 열 때 서버가 정리: 빈칸이 이미 없으면 표시만 남김)
  const markApplied = useCallback(async (jobId: string) => {
    try {
      await markFillApplied(jobId);
    } catch {
      // 네트워크 오류는 서버 정리에 맡김
    }
  }, []);

  // 자동 저장이 끝날 때마다 불림: 저장에 실패해 남지 않은 반영 표시를 남김
  const handleSaved = useCallback(() => {
    const jobIds = [...unmarkedJobIdsRef.current];

    unmarkedJobIdsRef.current.clear();

    for (const jobId of jobIds) {
      void markApplied(jobId);
    }
  }, [markApplied]);

  useEffect(() => {
    if (
      !editor ||
      editor.isDestroyed ||
      !fillResult ||
      appliedJobIdRef.current === fillResult.jobId
    ) {
      return;
    }

    const { jobId, blankId, paragraphs } = fillResult;

    appliedJobIdRef.current = jobId;

    // 그 빈칸만 결과로 바꿈 (update 이벤트로 자동 저장이 예약됨)
    const replaced = replaceBlankWithParagraphs(editor, blankId, paragraphs);

    onDone(jobId);

    if (!replaced) {
      // 빈칸이 사라졌으면 결과를 버리고 반영 표시만 남김
      void markApplied(jobId);
      return;
    }

    unmarkedJobIdsRef.current.add(jobId);
    void saveNow().then((isSaved) => {
      if (isSaved) {
        handleSaved();
      }
    });
  }, [editor, fillResult, onDone, saveNow, markApplied, handleSaved]);

  return { requestFill, handleSaved };
};
