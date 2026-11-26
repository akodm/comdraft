import { callGoogleApi } from '@/lib/report/google-auth';
import { addDays } from '@/lib/report/period';
import type { DateRange, ReportPeriod } from '@/lib/report/period';

/**
 * GA4 Data API 로 방문 현황 조회 (comdraft GA4 속성)
 * - 합계: 어제·그제·최근 7일·그 전 7일을 이름 붙인 기간으로 한 번에 조회
 * - 순위: 최근 7일 인기 페이지와 유입 경로 (상위 5개)
 * - 일별: 어드민 트래픽 그래프용 날짜별 합계
 */

// comdraft GA4 속성 ID (측정 ID G-RBN7WKJY1V 와 다른 값, 비밀값 아님)
export const GA4_PROPERTY_ID = '564312505';

const RANKING_LIMIT = 5;
const PAGE_FETCH_LIMIT = 50;

export interface TrafficTotals {
  activeUsers: number;
  sessions: number;
  pageViews: number;
}

export interface RankItem {
  label: string;
  value: number;
}

export interface TrafficSummary {
  yesterday: TrafficTotals;
  dayBefore: TrafficTotals;
  last7: TrafficTotals;
  prev7: TrafficTotals;
  topPages: RankItem[];
  topSources: RankItem[];
}

interface Ga4Report {
  rows?: Array<{
    dimensionValues?: Array<{ value?: string }>;
    metricValues?: Array<{ value?: string }>;
  }>;
}

const TOTAL_RANGE_NAMES = ['yesterday', 'dayBefore', 'last7', 'prev7'] as const;
type TotalRangeName = (typeof TOTAL_RANGE_NAMES)[number];

const toNumber = (value: string | undefined) => Number(value ?? 0) || 0;

// 여러 기간을 한 번에 조회하면 GA4 가 dateRange 차원(기간 이름)을 붙여 줌. 데이터가 없는 기간은 행이 없어 0
export const parseGa4Totals = <Name extends string>(
  report: Ga4Report,
  names: readonly Name[],
): Record<Name, TrafficTotals> => {
  const totals = Object.fromEntries(
    names.map((name) => [name, { activeUsers: 0, sessions: 0, pageViews: 0 }]),
  ) as Record<Name, TrafficTotals>;

  for (const row of report.rows ?? []) {
    const name = row.dimensionValues?.[0]?.value as Name | undefined;

    if (name && name in totals) {
      const [activeUsers, sessions, pageViews] = (row.metricValues ?? []).map(
        (metric) => toNumber(metric.value),
      );
      totals[name] = {
        activeUsers: activeUsers ?? 0,
        sessions: sessions ?? 0,
        pageViews: pageViews ?? 0,
      };
    }
  }

  return totals;
};

export const parseGa4Ranking = (report: Ga4Report): RankItem[] =>
  (report.rows ?? []).map((row) => ({
    label: row.dimensionValues?.[0]?.value ?? '',
    value: toNumber(row.metricValues?.[0]?.value),
  }));

const UUID_PATTERN =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

// 스튜디오처럼 주소에 UUID 가 든 페이지는 한 줄로 묶어 합치고 많은 순으로 상위만 남김
export const groupPagePaths = (
  items: RankItem[],
  limit: number,
): RankItem[] => {
  const grouped = new Map<string, number>();

  for (const { label, value } of items) {
    const path = label.replace(UUID_PATTERN, ':id');
    grouped.set(path, (grouped.get(path) ?? 0) + value);
  }

  return [...grouped]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
};

const runReport = (accessToken: string, body: unknown) =>
  callGoogleApi<Ga4Report>(
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
    accessToken,
    body,
  );

const rankingRequest = (
  period: ReportPeriod,
  dimension: string,
  metric: string,
  limit = RANKING_LIMIT,
) => ({
  dateRanges: [{ startDate: period.last7.start, endDate: period.last7.end }],
  dimensions: [{ name: dimension }],
  metrics: [{ name: metric }],
  orderBys: [{ metric: { metricName: metric }, desc: true }],
  limit,
});

export const fetchTrafficSummary = async (
  accessToken: string,
  period: ReportPeriod,
): Promise<TrafficSummary> => {
  const ranges: Record<TotalRangeName, { startDate: string; endDate: string }> =
    {
      yesterday: { startDate: period.yesterday, endDate: period.yesterday },
      dayBefore: { startDate: period.dayBefore, endDate: period.dayBefore },
      last7: { startDate: period.last7.start, endDate: period.last7.end },
      prev7: { startDate: period.prev7.start, endDate: period.prev7.end },
    };

  const [totalsReport, pagesReport, sourcesReport] = await Promise.all([
    runReport(accessToken, {
      dateRanges: TOTAL_RANGE_NAMES.map((name) => ({ ...ranges[name], name })),
      metrics: [
        { name: 'activeUsers' },
        { name: 'sessions' },
        { name: 'screenPageViews' },
      ],
    }),
    // UUID 주소를 묶은 뒤 상위를 고르도록 넉넉히 받음
    runReport(
      accessToken,
      rankingRequest(period, 'pagePath', 'screenPageViews', PAGE_FETCH_LIMIT),
    ),
    runReport(accessToken, rankingRequest(period, 'sessionSource', 'sessions')),
  ]);

  return {
    ...parseGa4Totals(totalsReport, TOTAL_RANGE_NAMES),
    topPages: groupPagePaths(parseGa4Ranking(pagesReport), RANKING_LIMIT),
    topSources: parseGa4Ranking(sourcesReport),
  };
};

export interface DailyTraffic extends TrafficTotals {
  // YYYY-MM-DD
  date: string;
}

// 기간의 모든 날짜 (양 끝 포함)
const listDates = ({ start, end }: DateRange) => {
  const dates: string[] = [];

  for (let date = start; date <= end; date = addDays(date, 1)) {
    dates.push(date);
  }

  return dates;
};

// GA4 date 차원은 YYYYMMDD. 데이터가 없는 날은 행이 없어 0 으로 채움
export const parseGa4Daily = (
  report: Ga4Report,
  range: DateRange,
): DailyTraffic[] => {
  const byDate = new Map<string, TrafficTotals>();

  for (const row of report.rows ?? []) {
    const raw = row.dimensionValues?.[0]?.value ?? '';
    const [activeUsers, sessions, pageViews] = (row.metricValues ?? []).map(
      (metric) => toNumber(metric.value),
    );

    byDate.set(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`, {
      activeUsers: activeUsers ?? 0,
      sessions: sessions ?? 0,
      pageViews: pageViews ?? 0,
    });
  }

  return listDates(range).map((date) => ({
    date,
    ...(byDate.get(date) ?? { activeUsers: 0, sessions: 0, pageViews: 0 }),
  }));
};

export const fetchDailyTraffic = async (
  accessToken: string,
  range: DateRange,
): Promise<DailyTraffic[]> => {
  const report = await runReport(accessToken, {
    dateRanges: [{ startDate: range.start, endDate: range.end }],
    dimensions: [{ name: 'date' }],
    metrics: [
      { name: 'activeUsers' },
      { name: 'sessions' },
      { name: 'screenPageViews' },
    ],
    orderBys: [{ dimension: { dimensionName: 'date' } }],
    // 기간 최대 90일보다 넉넉히
    limit: 400,
  });

  return parseGa4Daily(report, range);
};
