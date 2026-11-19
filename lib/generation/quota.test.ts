import { describe, expect, it } from 'vitest';
import {
  getJobUsage,
  getQuotaWeek,
  getUsageWindowStart,
  isWithinAllowance,
  summarizeQuota,
  toQuotaPlan,
  type QuotaPlan,
} from '@/lib/generation/quota';

const seoul: QuotaPlan = {
  role: 'basic',
  weeklyCostLimit: 100_000,
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
        estimatedCost: 50_000,
        usedCost: 12_000,
        errorCode: null,
      }),
    ).toBe(50_000);
    expect(
      getJobUsage({
        status: 'running',
        estimatedCost: 50_000,
        usedCost: 61_000,
        errorCode: null,
      }),
    ).toBe(61_000);
    expect(
      getJobUsage({
        status: 'queued',
        estimatedCost: null,
        usedCost: 0,
        errorCode: null,
      }),
    ).toBe(0);
    expect(
      getJobUsage({
        status: 'completed',
        estimatedCost: 50_000,
        usedCost: 42_000,
        errorCode: null,
      }),
    ).toBe(42_000);
    expect(
      getJobUsage({
        status: 'failed',
        estimatedCost: 90_000,
        usedCost: 0,
        errorCode: 'quota_exceeded',
      }),
    ).toBe(0);
    expect(
      getJobUsage({
        status: 'failed',
        estimatedCost: 50_000,
        usedCost: 7_000,
        errorCode: 'llm_failed',
      }),
    ).toBe(7_000);
  });

  it('답변 대기 작업은 예상량이 남아 있어도 쓴 비용만 센다', () => {
    expect(
      getJobUsage({
        status: 'awaiting_input',
        estimatedCost: 50_000,
        usedCost: 9_000,
        errorCode: null,
      }),
    ).toBe(9_000);
  });

  it('시작 전에 거부된 작업(service_paused, used_cost 0)은 사용량 0', () =>
    expect(
      getJobUsage({
        status: 'failed',
        errorCode: 'service_paused',
        estimatedCost: 500,
        usedCost: 0,
      }),
    ).toBe(0));
});

describe('getUsageWindowStart', () => {
  it('초기화 시점이 주 시작보다 늦으면 초기화 시점부터 셈', () => {
    expect(
      getUsageWindowStart(
        new Date('2026-11-15T15:00:00Z'),
        new Date('2026-11-18T03:00:00Z'),
      ),
    ).toEqual(new Date('2026-11-18T03:00:00Z'));
    expect(getUsageWindowStart(new Date('2026-11-15T15:00:00Z'), null)).toEqual(
      new Date('2026-11-15T15:00:00Z'),
    );
  });

  it('지난주에 초기화했으면 이번 주 시작부터 셈', () =>
    expect(
      getUsageWindowStart(
        new Date('2026-11-15T15:00:00Z'),
        new Date('2026-11-10T03:00:00Z'),
      ),
    ).toEqual(new Date('2026-11-15T15:00:00Z')));
});

describe('summarizeQuota', () => {
  it('요약: 남은 양 음수 허용', () => {
    const summary = summarizeQuota(
      seoul,
      [
        {
          status: 'completed',
          estimatedCost: 0,
          usedCost: 120_000,
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

  it('플랜을 내려 한도를 넘으면 사용률이 100% 를 넘고 남은 양이 음수', () => {
    const summary = summarizeQuota(
      { ...seoul, weeklyCostLimit: 1_000_000 },
      [
        {
          status: 'completed',
          estimatedCost: 0,
          usedCost: 1_230_000,
          errorCode: null,
        },
      ],
      new Date('2026-11-12T00:00:00Z'),
    );
    expect(summary.remaining).toBeLessThan(0);
    // 화면의 사용률 표시는 used / limit
    expect(Math.round((summary.used / summary.limit) * 100)).toBe(123);
  });
});

describe('toQuotaPlan', () => {
  it('numeric 문자열 비율도 숫자로', () => {
    expect(
      toQuotaPlan({
        role: 'pro',
        weeklyTokenLimit: 500_000,
        weeklyCostLimit: 6_000_000,
        overrunRatio: '1.30' as unknown as number,
        resetTimezone: 'Asia/Seoul',
        resetWeekday: 0,
        resetHour: 0,
        updatedAt: new Date(),
      }).overrunRatio,
    ).toBe(1.3);
  });
});
