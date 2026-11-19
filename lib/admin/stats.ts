import type { GenerationModel } from '@/lib/generation/contract';
import { isJobStale, type JobTimingFields } from '@/lib/generation/job-state';
import { getQuotaWeek, type QuotaPlan } from '@/lib/generation/quota';

/**
 * 어드민 대시보드 순수 집계 (DB 를 읽지 않음)
 */

const DAY_MS = 24 * 60 * 60 * 1000;

// 기본 등급 행이 없을 때 쓰는 기준 기간
const FALLBACK_DAYS = 7;

// 조치 요약 한 줄의 최대 글자 수
const SUMMARY_MAX_LENGTH = 60;

export interface ModelUsageRow {
  model: GenerationModel;
  usedCost: number;
}

export interface ModelUsage {
  model: GenerationModel;
  jobs: number;
  cost: number;
}

/** 모델별 작업 수와 비용 (비용 내림차순) */
export const summarizeModelUsage = (rows: ModelUsageRow[]): ModelUsage[] => {
  const byModel = new Map<GenerationModel, ModelUsage>();

  for (const row of rows) {
    const current = byModel.get(row.model) ?? {
      model: row.model,
      jobs: 0,
      cost: 0,
    };
    current.jobs += 1;
    current.cost += row.usedCost;
    byModel.set(row.model, current);
  }

  return [...byModel.values()].sort((a, b) => b.cost - a.cost);
};

/** 진행 중인 작업 행에 멈춤 의심 여부를 붙임 (isJobStale 과 같은 기준) */
export const markStale = <T extends JobTimingFields>(
  rows: T[],
  now: Date,
): Array<T & { stale: boolean }> => {
  return rows.map((row) => ({ ...row, stale: isJobStale(row, now) }));
};

/** 마이크로달러를 달러 문자열로 (소수 둘째 자리) */
export const formatMicroUsd = (micro: number): string => {
  return `$${(micro / 1_000_000).toFixed(2)}`;
};

/** 경과 시간 (밀리초) 을 "1d 2h", "1h 5m", "5m" 로 */
export const formatElapsed = (ms: number): string => {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
};

/**
 * 조치 기록 상세의 한 줄 요약
 * - reason, role 만 문자열일 때 보여 줌 (그 밖의 키와 객체는 절대 그대로 내보내지 않음)
 */
export const summarizeActionDetail = (
  detail: Record<string, unknown>,
): string => {
  const parts: string[] = [];

  for (const key of ['reason', 'role', 'title']) {
    const value = detail[key];

    if (typeof value === 'string' && value.trim() !== '') {
      parts.push(value.trim());
    }
  }

  const text = parts.join(' · ');

  return text.length > SUMMARY_MAX_LENGTH
    ? `${text.slice(0, SUMMARY_MAX_LENGTH)}…`
    : text;
};

/**
 * 통계 기준 기간의 시작
 * - 기본 등급 정책이 있으면 그 주 시작, 없으면 최근 7일 (fallback 으로 알려 화면에 표시)
 */
export const resolveStatsWindow = (
  now: Date,
  basicPlan: QuotaPlan | null,
): { start: Date; fallback: boolean } => {
  if (!basicPlan) {
    return {
      start: new Date(now.getTime() - FALLBACK_DAYS * DAY_MS),
      fallback: true,
    };
  }

  return { start: getQuotaWeek(now, basicPlan).start, fallback: false };
};
