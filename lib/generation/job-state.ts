import {
  GENERATION_QUEUED_TIMEOUT_MS,
  GENERATION_RUNNING_TIMEOUT_MS,
  type GenerationJobKind,
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
 * 초안 편집을 잠가야 하는 작업인지 (초안 작성 작업만, 서버의 lockingJobExists 와 같은 조건)
 * - 진행 중이거나, 완료했지만 결과를 아직 초안에 반영하지 않은 작업
 * - 빈칸 채우기 작업은 그 빈칸만 막으므로 편집기 전체를 잠그지 않음
 */
export const isJobLocking = (job: {
  kind: GenerationJobKind;
  status: GenerationStatus;
  applied: boolean;
}) => {
  return (
    job.kind === 'draft' &&
    (isJobActive(job.status) || (job.status === 'completed' && !job.applied))
  );
};

/**
 * 빈칸 채우기 작업이 그 빈칸을 막고 있는지
 * - 진행 중이거나, 완료했지만 열린 편집기가 결과를 아직 그 빈칸에 넣지 않은 작업
 */
export const isFillPending = (job: {
  kind: GenerationJobKind;
  status: GenerationStatus;
  applied: boolean;
}) => {
  return (
    job.kind === 'fill' &&
    (isJobActive(job.status) || (job.status === 'completed' && !job.applied))
  );
};

/**
 * 화면이 Realtime 구독·주기 조회로 따라가야 하는 작업인지
 * - 초안 작성은 편집기를 잠그는 동안, 빈칸 채우기는 진행 중인 동안 (편집기는 잠그지 않음)
 */
export const shouldWatchJob = (job: {
  kind: GenerationJobKind;
  status: GenerationStatus;
  applied: boolean;
}) => {
  return isJobLocking(job) || (job.kind === 'fill' && isJobActive(job.status));
};

// 실패를 화면에 다시 보여 줄 기간 (화면을 다시 열었을 때 방금 실패한 작업 안내)
export const RECENT_FAILURE_MS = 10 * 60 * 1000;

/**
 * 화면을 열 때 이어서 보여 줄 작업인지 (작업 종류와 무관)
 * - 진행 중이거나 잠금 중인 작업은 진행 상태를 이어서 받고, 최근에 실패한 작업은 실패 사유를 보여 줌
 */
export const isJobResumable = (
  job: {
    kind: GenerationJobKind;
    status: GenerationStatus;
    applied: boolean;
    finishedAt: string | null;
  },
  now: Date,
) => {
  if (isJobActive(job.status) || isJobLocking(job)) {
    return true;
  }

  return (
    job.status === 'failed' &&
    job.finishedAt !== null &&
    now.getTime() - new Date(job.finishedAt).getTime() < RECENT_FAILURE_MS
  );
};
