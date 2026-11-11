import type {
  GenerationJobKind,
  GenerationStatus,
} from '@/lib/generation/contract';
import { isFillPending, isJobLocking } from '@/lib/generation/job-state';
import { MAX_BLANK_ANSWER_LENGTH } from '@/lib/generation/limits';

/**
 * 편집기 빈칸의 AI 다듬기 상태 판단 (순수 함수)
 */

export interface BlankFillLock {
  // 다듬는 중이라 편집할 수 없는 빈칸 id
  fillingBlankId: string | null;
  // AI 작업(초안 작성·빈칸 채우기)이 진행 중이라 다른 빈칸도 다듬기를 막음
  isBusy: boolean;
}

interface LockJob {
  kind: GenerationJobKind;
  blankId: string | null;
  status: GenerationStatus;
  applied: boolean;
}

const IDLE_LOCK: BlankFillLock = { fillingBlankId: null, isBusy: false };

/**
 * 지금 막을 빈칸과 다듬기를 막을지
 * - pendingBlankId: 자동 저장을 마치고 요청을 보내는 중인 빈칸 (작업이 생기기 전)
 * - 빈칸 채우기: 진행 중이거나 결과를 아직 넣지 않았으면 그 빈칸을 막음
 * - 초안 작성: 빈칸은 따로 막지 않고(편집기 전체가 잠김) 다듬기만 막음
 */
export const getBlankFillLock = (
  job: LockJob | null,
  pendingBlankId: string | null,
): BlankFillLock => {
  if (pendingBlankId) {
    return { fillingBlankId: pendingBlankId, isBusy: true };
  }

  if (!job) {
    return IDLE_LOCK;
  }

  if (job.kind === 'fill') {
    return isFillPending(job)
      ? { fillingBlankId: job.blankId, isBusy: true }
      : IDLE_LOCK;
  }

  return { fillingBlankId: null, isBusy: isJobLocking(job) };
};

export interface BlankButtonState {
  // AI 로 다듬기
  canFill: boolean;
  // 그대로 넣기
  canInsert: boolean;
  // 지우기
  canRemove: boolean;
  // 답이 최대 길이를 넘어 안내가 필요함
  isTooLong: boolean;
}

/**
 * 다듬는 중이 아닌 빈칸의 버튼 상태 (다듬는 중인 빈칸은 버튼을 숨김)
 * - 다듬기: 답이 있고 1,000자 이하, 진행 중인 AI 작업이 없을 때
 * - 그대로 넣기: 답이 있을 때 / 지우기: 언제나
 * - 편집 잠금 중(AI 작성 중)에는 모두 막음
 */
export const getBlankButtonState = ({
  answer,
  isEditable,
  isBusy,
}: {
  answer: string;
  isEditable: boolean;
  isBusy: boolean;
}): BlankButtonState => {
  const length = answer.trim().length;
  const isTooLong = length > MAX_BLANK_ANSWER_LENGTH;

  return {
    canFill: isEditable && !isBusy && length > 0 && !isTooLong,
    canInsert: isEditable && length > 0,
    canRemove: isEditable,
    isTooLong,
  };
};
