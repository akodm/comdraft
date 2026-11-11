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
 * 열린 편집기가 보는 작업 상태 (빈칸 채우기의 applied 만 바꿈)
 * - 빈칸 채우기: 서버 반영 여부가 아니라 이 편집기가 결과를 넣거나 반영 표시를 했는지 (doneFillJobId)
 *   다른 화면에서 초안을 열어 서버가 먼저 반영했어도, 이 편집기는 결과를 넣을 때까지 그 빈칸을 막음
 * - 초안 작성: 서버 반영 여부 그대로
 */
export const toEditorJobView = <
  T extends { id: string; kind: GenerationJobKind; applied: boolean },
>(
  job: T,
  doneFillJobId: string | null,
): T => {
  return job.kind === 'fill'
    ? { ...job, applied: doneFillJobId === job.id }
    : job;
};

// 완료한 빈칸 채우기 결과를 열린 편집기가 처리할 방법 (insert: 그 빈칸에 넣음, mark: 반영 표시만, none: 할 일 없음)
export type FillResultAction = 'insert' | 'mark' | 'none';

/**
 * 완료한 빈칸 채우기 결과를 열린 편집기가 어떻게 처리할지
 * - 서버 반영 여부(applied)는 보지 않음: 다른 화면에서 초안을 열어 서버가 먼저 반영했어도 이 편집기 본문에는
 *   빈칸이 남아 있어, 넣지 않으면 다음 자동 저장이 서버 본문을 덮어 결과를 잃음
 *   (빈칸이 있으면 넣고, 반영 표시는 이미 남아 있으면 already_applied 로 끝남)
 * - 이 편집기가 이미 넣었거나 표시했으면 none, 빈칸이 사라졌으면 결과를 버리고 mark
 */
export const getFillResultAction = (
  job: {
    kind: GenerationJobKind;
    status: GenerationStatus;
    blankId: string | null;
    applied: boolean;
  },
  {
    hasParagraphs,
    isDoneHere,
    isBlankPresent,
  }: {
    // 넣을 결과 문단이 있는지
    hasParagraphs: boolean;
    // 이 편집기가 이미 결과를 넣었거나 반영 표시를 했는지
    isDoneHere: boolean;
    // 이 편집기 본문에 그 id 의 빈칸이 있는지
    isBlankPresent: boolean;
  },
): FillResultAction => {
  if (
    job.kind !== 'fill' ||
    job.status !== 'completed' ||
    !job.blankId ||
    !hasParagraphs ||
    isDoneHere
  ) {
    return 'none';
  }

  return isBlankPresent ? 'insert' : 'mark';
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
