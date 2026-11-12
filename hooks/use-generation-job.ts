import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSONContent } from '@tiptap/core';
import {
  getGenerationStatus,
  type GenerationQuota,
} from '@/lib/actions/generation';
import { GENERATION_BROADCAST_EVENT } from '@/lib/generation/contract';
import {
  isFillPending,
  isJobLocking,
  shouldWatchJob,
  toEditorJobView,
} from '@/lib/generation/job-state';
import type { GenerationJobView } from '@/lib/generation/jobs';
import { getBrowserSupabase } from '@/lib/supabase/browser';

// Realtime 신호가 끊겨도 진행 상황을 놓치지 않도록 주기적으로 다시 조회
const POLL_INTERVAL_MS = 5000;

interface UseGenerationJobOptions {
  // 화면을 열 때 이어서 볼 작업 (진행 중이거나 최근에 실패한 작업, 종류 무관)
  initialJob: GenerationJobView | null;
  // 초안 작성 결과가 초안에 반영되면 한 번 호출 (화면을 다시 불러와 새 본문 표시)
  onApplied: () => void;
  // 진행 중이던 작업이 답변 대기가 되면 한 번 호출 (초안 목록의 답변 대기 표시를 위해 화면을 다시 불러옴)
  onAwaitingInput?: () => void;
}

// 완료한 빈칸 채우기 결과 (편집기가 그 빈칸에 넣을 문단)
export interface BlankFillResult {
  jobId: string;
  blankId: string;
  paragraphs: JSONContent[];
}

interface JobState {
  // 서버가 알려준 작업 상태 (applied 는 서버 반영 여부)
  job: GenerationJobView | null;
  quota: GenerationQuota | null;
  // 완료한 빈칸 채우기 작업의 결과 문단 (상태 조회로 받음)
  fillParagraphs: JSONContent[] | null;
  // 이 편집기가 결과를 넣었거나 반영 표시를 한 빈칸 채우기 작업 (서버 반영 여부와 별개)
  doneFillJobId: string | null;
}

const EMPTY_STATE: JobState = {
  job: null,
  quota: null,
  fillParagraphs: null,
  doneFillJobId: null,
};

/**
 * 초안의 AI 작업 상태 (초안 작성·빈칸 채우기, 초안당 진행 작업은 하나)
 * - 따라갈 작업(잠금 중인 초안 작성, 진행 중인 빈칸 채우기)이 있으면 작업 channel 의 Realtime Broadcast 를
 *   구독하고, 신호를 받으면 상태 조회 액션으로 다시 읽음 (신호 내용은 믿지 않음) + 5초마다 다시 조회
 * - 초안 작성: 완료(결과 반영) 또는 실패하면 구독을 끝내고 잠금 해제, 반영되면 onApplied
 * - 빈칸 채우기: 편집기를 잠그지 않음. 완료하면 결과 문단(fillResult)을 넘기고, 편집기가 넣은 뒤
 *   markFillDone 으로 넣었다고 표시 (화면을 다시 불러오지 않음)
 *   서버가 먼저 반영했어도(다른 화면에서 초안을 엶) 이 편집기가 넣기 전까지는 결과를 넘김:
 *   넣지 않으면 이 편집기의 다음 자동 저장이 서버에 반영된 결과를 덮어 잃음
 */
export const useGenerationJob = ({
  initialJob,
  onApplied,
  onAwaitingInput,
}: UseGenerationJobOptions) => {
  // 화면을 열 때 받은 작업은 사용량 정보가 없음 (상태를 다시 조회하면 채워짐)
  const [{ job: serverJob, quota, fillParagraphs, doneFillJobId }, setState] =
    useState<JobState>({
      ...EMPTY_STATE,
      job: initialJob,
    });
  // 사용량 소진 안내를 닫은 작업 (화면을 다시 불러와도 상태가 유지되므로 닫은 뒤에는 다시 뜨지 않음)
  const [dismissedNoticeJobId, setDismissedNoticeJobId] = useState<
    string | null
  >(null);
  // 이미 반영을 알린 작업 (같은 완료를 여러 번 받아도 한 번만 처리)
  const notifiedJobIdRef = useRef<string | null>(null);
  // 이미 답변 대기를 알린 작업
  // (화면을 열 때 이미 답변 대기인 작업은 목록도 이미 반영되어 있으므로 알리지 않음)
  const awaitingNotifiedJobIdRef = useRef<string | null>(
    initialJob?.status === 'awaiting_input' ? initialJob.id : null,
  );
  // 빈칸 채우기의 applied 는 이 편집기가 처리했는지로 바꿔 봄 (그 빈칸 잠금, 결과 넘기기)
  const job = useMemo(
    () => (serverJob ? toEditorJobView(serverJob, doneFillJobId) : null),
    [serverJob, doneFillJobId],
  );
  const jobId = job?.id ?? null;
  const channel = job?.channel ?? null;
  const isLocked = job ? isJobLocking(job) : false;
  const isWatched = job ? shouldWatchJob(job) : false;

  const refreshStatus = useCallback(async () => {
    if (!jobId) {
      return;
    }

    try {
      const result = await getGenerationStatus(jobId);

      setState((current) => {
        if (current.job?.id !== jobId) {
          return current;
        }

        if (result.status !== 'ok') {
          return EMPTY_STATE;
        }

        // 서버 반영은 되돌아가지 않으므로 늦게 도착한 조회 결과로 반영 전으로 돌리지 않음
        const applied = current.job.applied || result.job.applied;

        return {
          ...current,
          job: { ...result.job, applied },
          quota: result.quota,
          fillParagraphs: result.fillParagraphs,
        };
      });
    } catch {
      // 네트워크 오류는 다음 신호나 주기 조회에서 다시 시도
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId || !channel || !isWatched) {
      return;
    }

    const supabase = getBrowserSupabase();
    const subscription = supabase
      ?.channel(channel)
      .on('broadcast', { event: GENERATION_BROADCAST_EVENT }, () => {
        void refreshStatus();
      })
      .subscribe((state) => {
        // 구독 전에 지나간 신호가 있을 수 있어 구독 직후 한 번 다시 조회
        if (state === 'SUBSCRIBED') {
          void refreshStatus();
        }
      });
    const timer = window.setInterval(
      () => void refreshStatus(),
      POLL_INTERVAL_MS,
    );

    return () => {
      window.clearInterval(timer);

      if (supabase && subscription) {
        void supabase.removeChannel(subscription);
      }
    };
  }, [jobId, channel, isWatched, refreshStatus]);

  useEffect(() => {
    // 빈칸 채우기는 편집기가 그 빈칸만 바꾸므로 화면을 다시 불러오지 않음
    if (
      job?.kind === 'draft' &&
      job.status === 'completed' &&
      job.applied &&
      notifiedJobIdRef.current !== job.id
    ) {
      notifiedJobIdRef.current = job.id;
      onApplied();
    }
  }, [job, onApplied]);

  useEffect(() => {
    if (
      job?.kind === 'draft' &&
      job.status === 'awaiting_input' &&
      awaitingNotifiedJobIdRef.current !== job.id
    ) {
      awaitingNotifiedJobIdRef.current = job.id;
      onAwaitingInput?.();
    }
  }, [job, onAwaitingInput]);

  // 새로 시작한 작업 추적 / 실패 안내 닫기
  const start = useCallback((startedJob: GenerationJobView) => {
    setState({ ...EMPTY_STATE, job: startedJob });
  }, []);
  // 진행 중인(결과를 아직 넣지 않은) 빈칸 채우기는 지우지 않음 (작성 요청 영역이 제출 전에 불러도 그 빈칸 잠금 유지)
  const dismiss = useCallback(
    () =>
      setState((current) =>
        current.job &&
        isFillPending(toEditorJobView(current.job, current.doneFillJobId))
          ? current
          : EMPTY_STATE,
      ),
    [],
  );
  // 편집기가 빈칸 채우기 결과를 넣었음 (그 빈칸 잠금 해제, 같은 결과를 다시 넣지 않음)
  const markFillDone = useCallback((doneJobId: string) => {
    setState((current) =>
      current.job?.id === doneJobId
        ? { ...current, doneFillJobId: doneJobId }
        : current,
    );
  }, []);
  // 이 편집기가 아직 처리하지 않은 결과 (job.applied 는 이 편집기 기준, 서버 반영 여부는 보지 않음)
  const fillResult = useMemo<BlankFillResult | null>(
    () =>
      job?.kind === 'fill' &&
      job.status === 'completed' &&
      !job.applied &&
      job.blankId &&
      fillParagraphs
        ? { jobId: job.id, blankId: job.blankId, paragraphs: fillParagraphs }
        : null,
    [job, fillParagraphs],
  );

  // 작성은 끝났지만 이번 주 사용량을 모두 쓴 경우 알림 (다음 요청은 거부됨)
  const exhaustedQuota =
    job?.status === 'completed' &&
    quota &&
    quota.remaining <= 0 &&
    dismissedNoticeJobId !== job.id
      ? quota
      : null;
  const dismissExhaustedNotice = useCallback(() => {
    if (jobId) {
      setDismissedNoticeJobId(jobId);
    }
  }, [jobId]);

  return {
    job,
    quota,
    isLocked,
    fillResult,
    exhaustedQuota,
    start,
    dismiss,
    markFillDone,
    dismissExhaustedNotice,
  };
};
