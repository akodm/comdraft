import { describe, expect, it } from 'vitest';
import {
  formatElapsed,
  formatMicroUsd,
  markStale,
  resolveStatsWindow,
  summarizeActionDetail,
  summarizeModelUsage,
} from '@/lib/admin/stats';
import {
  GENERATION_QUEUED_TIMEOUT_MS,
  GENERATION_RUNNING_TIMEOUT_MS,
} from '@/lib/generation/contract';
import { isJobStale } from '@/lib/generation/job-state';
import type { QuotaPlan } from '@/lib/generation/quota';

const NOW = new Date('2026-11-19T00:00:00.000Z');

describe('summarizeModelUsage', () => {
  it('모델별로 묶고 비용 내림차순으로 정렬', () => {
    const result = summarizeModelUsage([
      { model: 'haiku', usedCost: 100 },
      { model: 'opus', usedCost: 5_000 },
      { model: 'haiku', usedCost: 300 },
      { model: 'sonnet', usedCost: 1_000 },
    ]);

    expect(result).toEqual([
      { model: 'opus', jobs: 1, cost: 5_000 },
      { model: 'sonnet', jobs: 1, cost: 1_000 },
      { model: 'haiku', jobs: 2, cost: 400 },
    ]);
  });

  it('행이 없으면 빈 배열', () => {
    expect(summarizeModelUsage([])).toEqual([]);
  });
});

describe('markStale', () => {
  it('stale 이 isJobStale 과 같음', () => {
    const rows = [
      {
        status: 'running' as const,
        createdAt: new Date(NOW.getTime() - GENERATION_RUNNING_TIMEOUT_MS * 2),
        startedAt: new Date(NOW.getTime() - GENERATION_RUNNING_TIMEOUT_MS * 2),
      },
      {
        status: 'running' as const,
        createdAt: new Date(NOW.getTime() - 1000),
        startedAt: new Date(NOW.getTime() - 1000),
      },
      {
        status: 'queued' as const,
        createdAt: new Date(NOW.getTime() - GENERATION_QUEUED_TIMEOUT_MS * 2),
        startedAt: null,
      },
      {
        status: 'awaiting_input' as const,
        createdAt: new Date(NOW.getTime() - 1e10),
        startedAt: null,
      },
    ];

    const marked = markStale(rows, NOW);

    expect(marked.map((row) => row.stale)).toEqual(
      rows.map((row) => isJobStale(row, NOW)),
    );
    expect(marked.map((row) => row.stale)).toEqual([true, false, true, false]);
  });
});

describe('formatMicroUsd', () => {
  it('마이크로달러를 소수 둘째 자리 달러로', () => {
    expect(formatMicroUsd(1_234_567)).toBe('$1.23');
    expect(formatMicroUsd(0)).toBe('$0.00');
    expect(formatMicroUsd(5_000)).toBe('$0.01');
  });
});

describe('formatElapsed', () => {
  it('분·시간·일 단위로', () => {
    expect(formatElapsed(30_000)).toBe('0m');
    expect(formatElapsed(5 * 60_000)).toBe('5m');
    expect(formatElapsed(65 * 60_000)).toBe('1h 5m');
    expect(formatElapsed(26 * 3_600_000)).toBe('1d 2h');
  });

  it('음수는 0m', () => {
    expect(formatElapsed(-5)).toBe('0m');
  });
});

describe('summarizeActionDetail', () => {
  it('사유와 등급만 짧게 보여 줌', () => {
    expect(summarizeActionDetail({ reason: '스팸', role: 'pro' })).toBe(
      '스팸 · pro',
    );
  });

  it('프롬프트 수정 기록은 키와 작업 종류를 보여 줌', () => {
    expect(
      summarizeActionDetail({ locale: 'ko', key: 'plan.system', op: 'save' }),
    ).toBe('plan.system · save');
  });

  it('긴 사유는 잘라 냄', () => {
    const result = summarizeActionDetail({ reason: 'a'.repeat(200) });
    expect(result.length).toBeLessThanOrEqual(61);
    expect(result.endsWith('…')).toBe(true);
  });

  it('모르는 키나 JSON 덩어리는 보여 주지 않음', () => {
    expect(summarizeActionDetail({ content: 'secret', nested: { a: 1 } })).toBe(
      '',
    );
    expect(summarizeActionDetail({ reason: { a: 1 } })).toBe('');
    expect(summarizeActionDetail({})).toBe('');
  });
});

describe('resolveStatsWindow', () => {
  const plan: QuotaPlan = {
    role: 'basic',
    weeklyCostLimit: 1,
    overrunRatio: 1,
    resetTimezone: 'Asia/Seoul',
    resetWeekday: 1,
    resetHour: 0,
  };

  it('기본 등급이 있으면 그 주 시작', () => {
    const result = resolveStatsWindow(NOW, plan);
    expect(result.fallback).toBe(false);
    expect(result.start.getTime()).toBeLessThanOrEqual(NOW.getTime());
  });

  it('없으면 최근 7일', () => {
    const result = resolveStatsWindow(NOW, null);
    expect(result.fallback).toBe(true);
    expect(result.start.getTime()).toBe(NOW.getTime() - 7 * 24 * 3_600_000);
  });
});
