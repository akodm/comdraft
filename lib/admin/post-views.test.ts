import { describe, expect, it } from 'vitest';
import {
  fillDailyViews,
  parseViewRange,
  viewAxisTicks,
  viewRangeStart,
} from '@/lib/admin/post-views';

// 2026-11-20 12:00 KST
const NOW = new Date('2026-11-20T03:00:00Z');

describe('parseViewRange', () => {
  it('7·30·90 만 받고 나머지는 30', () => {
    expect(parseViewRange('7')).toBe(7);
    expect(parseViewRange('90')).toBe(90);
    expect(parseViewRange('30')).toBe(30);
    expect(parseViewRange('365')).toBe(30);
    expect(parseViewRange(undefined)).toBe(30);
    expect(parseViewRange('abc')).toBe(30);
  });
});

describe('viewRangeStart', () => {
  it('오늘을 포함한 N 일의 첫날 0시 (한국 시간)', () => {
    // 7일: 11/14 ~ 11/20 → 11/14 00:00 KST = 11/13 15:00 UTC
    expect(viewRangeStart(NOW, 7).toISOString()).toBe(
      '2026-11-13T15:00:00.000Z',
    );
  });
});

describe('fillDailyViews', () => {
  it('조회가 없는 날은 0 으로 채우고 날짜 순으로 N 개를 돌려준다', () => {
    const series = fillDailyViews(
      [
        { day: '2026-11-15', views: 3 },
        { day: '2026-11-20', views: 1 },
      ],
      NOW,
      7,
    );

    expect(series).toEqual([
      { date: '2026-11-14', views: 0 },
      { date: '2026-11-15', views: 3 },
      { date: '2026-11-16', views: 0 },
      { date: '2026-11-17', views: 0 },
      { date: '2026-11-18', views: 0 },
      { date: '2026-11-19', views: 0 },
      { date: '2026-11-20', views: 1 },
    ]);
  });

  it('구간 밖 날짜는 버린다', () => {
    const series = fillDailyViews([{ day: '2026-11-01', views: 9 }], NOW, 7);

    expect(series.every((point) => point.views === 0)).toBe(true);
  });

  it('한국 시간 자정 직후는 그 날로 센다', () => {
    // 11/20 00:30 KST = 11/19 15:30 UTC
    const series = fillDailyViews([], new Date('2026-11-19T15:30:00Z'), 1);

    expect(series).toEqual([{ date: '2026-11-20', views: 0 }]);
  });
});

describe('viewAxisTicks', () => {
  it('0 부터 깔끔한 최댓값까지 눈금', () => {
    expect(viewAxisTicks(0)).toEqual([0, 1]);
    expect(viewAxisTicks(3)).toEqual([0, 1, 2, 3]);
    expect(viewAxisTicks(7)).toEqual([0, 2, 4, 6, 8]);
    expect(viewAxisTicks(42)).toEqual([0, 10, 20, 30, 40, 50]);
    expect(viewAxisTicks(130)).toEqual([0, 50, 100, 150]);
  });
});
