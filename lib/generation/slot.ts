import {
  GENERATION_HOURLY_LIMIT,
  MAX_ACTIVE_GENERATIONS,
} from '@/lib/generation/limits';

// 새 작업을 받을 수 있는지 (시간당 요청 수 → 동시에 진행 중인 작업 수 순서로 확인)
export type GenerationSlotStatus = 'ok' | 'rate_limited' | 'too_many_active';

export interface GenerationSlotCounts {
  // 지난 1시간 동안 만든 작업 수
  recentJobs: number;
  // 진행 중(queued·running) 작업 수
  activeJobs: number;
}

export const decideGenerationSlot = ({
  recentJobs,
  activeJobs,
}: GenerationSlotCounts): GenerationSlotStatus => {
  if (recentJobs >= GENERATION_HOURLY_LIMIT) {
    return 'rate_limited';
  }

  if (activeJobs >= MAX_ACTIVE_GENERATIONS) {
    return 'too_many_active';
  }

  return 'ok';
};
