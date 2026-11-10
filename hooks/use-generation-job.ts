import { useCallback, useEffect, useRef, useState } from 'react';
import { getGenerationStatus } from '@/lib/actions/generation';
import { GENERATION_BROADCAST_EVENT } from '@/lib/generation/contract';
import { isJobLocking } from '@/lib/generation/job-state';
import type { GenerationJobView } from '@/lib/generation/jobs';
import { getBrowserSupabase } from '@/lib/supabase/browser';

// Realtime 신호가 끊겨도 진행 상황을 놓치지 않도록 주기적으로 다시 조회
const POLL_INTERVAL_MS = 5000;

// 상태 조회가 알려주는 이번 주 남은 사용량 (완료/실패한 작업에만 있음)
export interface GenerationQuota {
  remaining: number;
  resetsAt: string;
}

interface UseGenerationJobOptions {
  // 화면을 열 때 이어서 볼 작업 (진행 중이거나 최근에 실패한 작업)
  initialJob: GenerationJobView | null;
  // 결과가 초안에 반영되면 한 번 호출 (화면을 다시 불러와 새 본문 표시)
  onApplied: () => void;
}

/**
 * 초안의 AI 작성 작업 상태
 * - 잠금 중인 작업이 있으면 작업 channel 의 Realtime Broadcast 를 구독하고, 신호를 받으면 상태 조회 액션으로 다시 읽음
 *   (신호 내용은 믿지 않음) + 5초마다 다시 조회
 * - 완료(결과 반영) 또는 실패하면 구독을 끝내고 잠금 해제
 */
export const useGenerationJob = ({
  initialJob,
  onApplied,
}: UseGenerationJobOptions) => {
  // 화면을 열 때 받은 작업은 사용량 정보가 없음 (상태를 다시 조회하면 채워짐)
  const [{ job, quota }, setState] = useState<{
    job: GenerationJobView | null;
    quota: GenerationQuota | null;
  }>({ job: initialJob, quota: null });
  // 사용량 소진 안내를 닫은 작업 (화면을 다시 불러와도 상태가 유지되므로 닫은 뒤에는 다시 뜨지 않음)
  const [dismissedNoticeJobId, setDismissedNoticeJobId] = useState<
    string | null
  >(null);
  // 이미 반영을 알린 작업 (같은 완료를 여러 번 받아도 한 번만 처리)
  const notifiedJobIdRef = useRef<string | null>(null);
  const jobId = job?.id ?? null;
  const channel = job?.channel ?? null;
  const isLocked = job ? isJobLocking(job) : false;

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

        return result.status === 'ok'
          ? { job: result.job, quota: result.quota }
          : { job: null, quota: null };
      });
    } catch {
      // 네트워크 오류는 다음 신호나 주기 조회에서 다시 시도
    }
  }, [jobId]);

  useEffect(() => {
    if (!jobId || !channel || !isLocked) {
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
  }, [jobId, channel, isLocked, refreshStatus]);

  useEffect(() => {
    if (
      job?.status === 'completed' &&
      job.applied &&
      notifiedJobIdRef.current !== job.id
    ) {
      notifiedJobIdRef.current = job.id;
      onApplied();
    }
  }, [job, onApplied]);

  // 새로 시작한 작업 추적 / 실패 안내 닫기
  const start = useCallback((startedJob: GenerationJobView) => {
    setState({ job: startedJob, quota: null });
  }, []);
  const dismiss = useCallback(() => setState({ job: null, quota: null }), []);

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
    exhaustedQuota,
    start,
    dismiss,
    dismissExhaustedNotice,
  };
};
