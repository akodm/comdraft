import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 게시글 일별 조회 수 (어드민 그래프용 순수 함수)
 * - 날짜는 한국 시간 기준 (서비스의 다른 주 경계·표시와 같은 시간대)
 * - 조회가 없는 날도 0 으로 채워 선이 끊기지 않게 함
 */

export const VIEW_TIMEZONE = 'Asia/Seoul';
export const VIEW_RANGES = [7, 30, 90] as const;
export type ViewRange = (typeof VIEW_RANGES)[number];
export const DEFAULT_VIEW_RANGE: ViewRange = 30;

export interface DailyViews {
  // YYYY-MM-DD (한국 시간)
  date: string;
  views: number;
}

export function parseViewRange(value: string | undefined): ViewRange {
  const days = Number(value);

  return VIEW_RANGES.find((range) => range === days) ?? DEFAULT_VIEW_RANGE;
}

// 오늘을 포함한 days 일의 첫날 0시 (한국 시간)
export function viewRangeStart(now: Date, days: number): Date {
  return dayjs(now)
    .tz(VIEW_TIMEZONE)
    .startOf('day')
    .subtract(days - 1, 'day')
    .toDate();
}

export function fillDailyViews(
  rows: Array<{ day: string; views: number }>,
  now: Date,
  days: number,
): DailyViews[] {
  const counts = new Map(rows.map((row) => [row.day, row.views]));
  const first = dayjs(viewRangeStart(now, days)).tz(VIEW_TIMEZONE);

  return Array.from({ length: days }, (_, index) => {
    const date = first.add(index, 'day').format('YYYY-MM-DD');

    return { date, views: counts.get(date) ?? 0 };
  });
}

// y 축 눈금: 0 부터 1·2·5 계열의 깔끔한 간격으로 최댓값을 덮을 때까지 (정수만)
export function viewAxisTicks(max: number): number[] {
  if (max <= 0) {
    return [0, 1];
  }

  const rough = max / 5;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(
    1,
    [1, 2, 5, 10]
      .map((factor) => factor * magnitude)
      .find((candidate) => candidate >= rough) ?? 10 * magnitude,
  );
  const top = Math.ceil(max / step) * step;

  return Array.from({ length: top / step + 1 }, (_, index) => index * step);
}
