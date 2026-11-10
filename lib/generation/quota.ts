import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import type { DraftPromptStatus } from '@/lib/db/schema/draft';

dayjs.extend(utc);
dayjs.extend(timezone);

export interface QuotaPlan {
  role: string;
  weeklyTokenLimit: number;
  overrunRatio: number;
  resetTimezone: string;
  resetWeekday: number;
  resetHour: number;
}

export interface QuotaJob {
  status: DraftPromptStatus;
  estimatedTokens: number | null;
  usedTokens: number;
  errorCode: string | null;
}

export interface QuotaSummary {
  role: string;
  limit: number;
  used: number;
  remaining: number;
  resetsAt: Date;
}

/**
 * now 가 속한 할당량 주의 시작과 다음 초기화 시각
 * - 주 시작은 now 이전(포함)의 가장 가까운 resetWeekday 요일 resetHour 시 (resetTimezone 기준)
 * - 서버 시간대와 무관하게 plan 의 시간대로만 계산
 */
export function getQuotaWeek(
  now: Date,
  plan: QuotaPlan,
): { start: Date; resetsAt: Date } {
  const local = dayjs(now).tz(plan.resetTimezone);
  const sameDayReset = local.startOf('day').hour(plan.resetHour);
  const daysBack = (local.day() - plan.resetWeekday + 7) % 7;
  let start = sameDayReset.subtract(daysBack, 'day');
  // 초기화 요일 당일이지만 아직 초기화 시각 전이면 지난주로 본다
  if (start.valueOf() > now.getTime()) {
    start = start.subtract(7, 'day');
  }
  return { start: start.toDate(), resetsAt: start.add(7, 'day').toDate() };
}

/** 예상 사용량이 남은 양의 허용 비율 이내인지 (남은 양이 0 이하면 항상 거부) */
export function isWithinAllowance(
  estimate: number,
  remaining: number,
  plan: QuotaPlan,
): boolean {
  return remaining > 0 && estimate <= remaining * plan.overrunRatio;
}

/** 작업 하나가 이번 주 사용량에 더하는 토큰 수 */
export function getJobUsage(job: QuotaJob): number {
  if (job.status === 'queued' || job.status === 'running') {
    return Math.max(job.estimatedTokens ?? 0, job.usedTokens);
  }
  if (job.status === 'failed' && job.errorCode === 'quota_exceeded') {
    return 0;
  }
  return job.usedTokens;
}

/** 이번 주 사용량 요약 (remaining 은 음수 가능) */
export function summarizeQuota(
  plan: QuotaPlan,
  jobs: QuotaJob[],
  now: Date,
): QuotaSummary {
  const used = jobs.reduce((sum, job) => sum + getJobUsage(job), 0);
  return {
    role: plan.role,
    limit: plan.weeklyTokenLimit,
    used,
    remaining: plan.weeklyTokenLimit - used,
    resetsAt: getQuotaWeek(now, plan).resetsAt,
  };
}
