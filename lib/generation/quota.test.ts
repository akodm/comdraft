import { describe, expect, it } from 'vitest';
import {
  getJobUsage,
  getQuotaWeek,
  isWithinAllowance,
  summarizeQuota,
  type QuotaPlan,
} from '@/lib/generation/quota';

const seoul: QuotaPlan = {
  role: 'basic',
  weeklyTokenLimit: 100_000,
  overrunRatio: 1.3,
  resetTimezone: 'Asia/Seoul',
  resetWeekday: 0,
  resetHour: 0,
};

describe('getQuotaWeek', () => {
  it('토 23:59:59 KST 는 지난 일요일 주', () => {
    expect(getQuotaWeek(new Date('2026-11-14T14:59:59Z'), seoul)).toEqual({
      start: new Date('2026-11-07T15:00:00Z'),
      resetsAt: new Date('2026-11-14T15:00:00Z'),
    });
  });

  it('일 00:00 KST 는 그 시각이 주 시작', () => {
    expect(getQuotaWeek(new Date('2026-11-14T15:00:00Z'), seoul)).toEqual({
      start: new Date('2026-11-14T15:00:00Z'),
      resetsAt: new Date('2026-11-21T15:00:00Z'),
    });
  });

  it('다른 정책: UTC 월요일 9시', () => {
    const plan = {
      ...seoul,
      resetTimezone: 'UTC',
      resetWeekday: 1,
      resetHour: 9,
    };
    expect(getQuotaWeek(new Date('2026-11-16T08:59:59Z'), plan).start).toEqual(
      new Date('2026-11-09T09:00:00Z'),
    );
    expect(getQuotaWeek(new Date('2026-11-16T09:00:00Z'), plan).start).toEqual(
      new Date('2026-11-16T09:00:00Z'),
    );
  });
});

describe('isWithinAllowance', () => {
  it('남은 양의 1.3배까지 허용', () => {
    expect(isWithinAllowance(26_000, 20_000, seoul)).toBe(true);
    expect(isWithinAllowance(26_001, 20_000, seoul)).toBe(false);
    expect(isWithinAllowance(1, 0, seoul)).toBe(false);
    expect(isWithinAllowance(1, -5, seoul)).toBe(false);
  });
});

describe('getJobUsage', () => {
  it('작업별 사용량 규칙', () => {
    expect(
      getJobUsage({
        status: 'running',
        estimatedTokens: 50_000,
        usedTokens: 12_000,
        errorCode: null,
      }),
    ).toBe(50_000);
    expect(
      getJobUsage({
        status: 'running',
        estimatedTokens: 50_000,
        usedTokens: 61_000,
        errorCode: null,
      }),
    ).toBe(61_000);
    expect(
      getJobUsage({
        status: 'queued',
        estimatedTokens: null,
        usedTokens: 0,
        errorCode: null,
      }),
    ).toBe(0);
    expect(
      getJobUsage({
        status: 'completed',
        estimatedTokens: 50_000,
        usedTokens: 42_000,
        errorCode: null,
      }),
    ).toBe(42_000);
    expect(
      getJobUsage({
        status: 'failed',
        estimatedTokens: 90_000,
        usedTokens: 0,
        errorCode: 'quota_exceeded',
      }),
    ).toBe(0);
    expect(
      getJobUsage({
        status: 'failed',
        estimatedTokens: 50_000,
        usedTokens: 7_000,
        errorCode: 'llm_failed',
      }),
    ).toBe(7_000);
  });
});

describe('summarizeQuota', () => {
  it('요약: 남은 양 음수 허용', () => {
    const summary = summarizeQuota(
      seoul,
      [
        {
          status: 'completed',
          estimatedTokens: 0,
          usedTokens: 120_000,
          errorCode: null,
        },
      ],
      new Date('2026-11-12T00:00:00Z'),
    );
    expect(summary).toMatchObject({
      role: 'basic',
      limit: 100_000,
      used: 120_000,
      remaining: -20_000,
    });
    expect(summary.resetsAt).toEqual(new Date('2026-11-14T15:00:00Z'));
  });
});
