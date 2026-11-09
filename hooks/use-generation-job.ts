import { useCallback, useEffect, useRef, useState } from 'react';
import { getGenerationStatus } from '@/lib/actions/generation';
import { GENERATION_BROADCAST_EVENT } from '@/lib/generation/contract';
import { isJobLocking } from '@/lib/generation/job-state';
import type { GenerationJobView } from '@/lib/generation/jobs';
import { getBrowserSupabase } from '@/lib/supabase/browser';

// Realtime 신호가 끊겨도 진행 상황을 놓치지 않도록 주기적으로 다시 조회
const POLL_INTERVAL_MS = 5000;

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
  const [job, setJob] = useState(initialJob);
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

      setJob((current) => {
        if (current?.id !== jobId) {
          return current;
        }

        return result.status === 'ok' ? result.job : null;
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
    setJob(startedJob);
  }, []);
  const dismiss = useCallback(() => setJob(null), []);

  return { job, isLocked, start, dismiss };
};
