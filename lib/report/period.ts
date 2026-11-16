/**
 * 일일 현황 보고의 날짜 계산 (모두 한국 시간 기준, 서머타임 없음)
 * - 매일 아침 실행해서 "어제" 하루와 어제까지 최근 7일, 그 전 7일을 비교
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// YYYY-MM-DD 기간 (양 끝 포함)
export interface DateRange {
  start: string;
  end: string;
}

export interface ReportPeriod {
  // 보고하는 날 (실행 시각의 한국 날짜)
  reportDate: string;
  yesterday: string;
  dayBefore: string;
  // 어제까지 7일
  last7: DateRange;
  // 그 전 7일
  prev7: DateRange;
  // 어제 하루의 UTC 시각 범위 [start, end) (DB 조회용)
  yesterdayRange: { start: Date; end: Date };
}

const toDateString = (date: Date) => date.toISOString().slice(0, 10);

// YYYY-MM-DD 에 날짜 더하기
export const addDays = (date: string, days: number) =>
  toDateString(new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS));

export const getReportPeriod = (now: Date): ReportPeriod => {
  const reportDate = toDateString(new Date(now.getTime() + KST_OFFSET_MS));
  const yesterday = addDays(reportDate, -1);

  // 한국 날짜 0시 = 그 날짜 UTC 0시 - 9시간
  const kstMidnight = (date: string) =>
    new Date(Date.parse(`${date}T00:00:00Z`) - KST_OFFSET_MS);

  return {
    reportDate,
    yesterday,
    dayBefore: addDays(reportDate, -2),
    last7: { start: addDays(reportDate, -7), end: yesterday },
    prev7: { start: addDays(reportDate, -14), end: addDays(reportDate, -8) },
    yesterdayRange: {
      start: kstMidnight(yesterday),
      end: kstMidnight(reportDate),
    },
  };
};
