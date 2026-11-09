import {
  GENERATION_QUEUED_TIMEOUT_MS,
  GENERATION_RUNNING_TIMEOUT_MS,
  type GenerationStatus,
} from '@/lib/generation/contract';

/**
 * 작업 상태 판단 (순수 함수, 서버/클라이언트 공용)
 */

export interface JobTimingFields {
  status: GenerationStatus;
  createdAt: Date;
  startedAt: Date | null;
}

// 이 시각보다 먼저 시작/생성된 진행 중 작업은 시간 초과
export const getStaleCutoffs = (now: Date) => ({
  runningStartedBefore: new Date(now.getTime() - GENERATION_RUNNING_TIMEOUT_MS),
  queuedCreatedBefore: new Date(now.getTime() - GENERATION_QUEUED_TIMEOUT_MS),
});

/**
 * 시간 제한을 넘긴 진행 중 작업인지
 * - running: 시작 시각(없으면 생성 시각) 기준
 * - queued: 생성 시각 기준 (Lambda 가 시작하지 못함)
 */
export const isJobStale = (job: JobTimingFields, now: Date) => {
  const { runningStartedBefore, queuedCreatedBefore } = getStaleCutoffs(now);

  if (job.status === 'running') {
    return (job.startedAt ?? job.createdAt) < runningStartedBefore;
  }

  if (job.status === 'queued') {
    return job.createdAt < queuedCreatedBefore;
  }

  return false;
};

export const isJobActive = (status: GenerationStatus) => {
  return status === 'queued' || status === 'running';
};

/**
 * 초안 편집을 잠가야 하는 작업인지
 * - 진행 중이거나, 완료했지만 결과를 아직 초안에 반영하지 않은 작업
 */
export const isJobLocking = (job: {
  status: GenerationStatus;
  applied: boolean;
}) => {
  return (
    isJobActive(job.status) || (job.status === 'completed' && !job.applied)
  );
};

// 실패를 화면에 다시 보여 줄 기간 (화면을 다시 열었을 때 방금 실패한 작업 안내)
export const RECENT_FAILURE_MS = 10 * 60 * 1000;

/**
 * 화면을 열 때 이어서 보여 줄 작업인지
 * - 잠금 중인 작업은 진행 상태를 이어서 받고, 최근에 실패한 작업은 실패 사유를 보여 줌
 */
export const isJobResumable = (
  job: {
    status: GenerationStatus;
    applied: boolean;
    finishedAt: string | null;
  },
  now: Date,
) => {
  if (isJobLocking(job)) {
    return true;
  }

  return (
    job.status === 'failed' &&
    job.finishedAt !== null &&
    now.getTime() - new Date(job.finishedAt).getTime() < RECENT_FAILURE_MS
  );
};
