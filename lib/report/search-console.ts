import type { RankItem } from '@/lib/report/ga4';
import { callGoogleApi } from '@/lib/report/google-auth';
import {
  addDays,
  type DateRange,
  type ReportPeriod,
} from '@/lib/report/period';

/**
 * Search Console API 로 검색 성과 조회 (도메인 속성 comdraft.dev)
 * - 검색 데이터는 2~3일 늦게 확정되어 "어제" 대신 확정된 최근 날짜와 그날까지 7일을 보고
 * - 날짜별로 한 번 받아 최근 날짜·최근 7일·그 전 7일을 계산하고, 최근 7일 인기 검색어를 따로 조회
 */

// 도메인 속성이라 sc-domain: 접두사 (비밀값 아님)
export const SEARCH_CONSOLE_SITE_URL = 'sc-domain:comdraft.dev';

// 최근 날짜를 찾고 7일씩 두 기간을 담을 만큼 거슬러 조회 (확정 지연 3일 + 14일 + 여유)
const LOOKBACK_DAYS = 20;
const QUERY_LIMIT = 5;

export interface SearchTotals {
  clicks: number;
  impressions: number;
  ctr: number;
  // 노출 수로 가중한 평균 순위 (노출이 없으면 null)
  position: number | null;
}

export interface SearchSummary {
  // 데이터가 있는 가장 최근 날짜 (없으면 null)
  latestDate: string | null;
  latest: SearchTotals;
  last7Range: DateRange | null;
  last7: SearchTotals;
  prev7: SearchTotals;
  topQueries: RankItem[];
}

interface SearchRow {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  position?: number;
}

const sumRows = (rows: SearchRow[]): SearchTotals => {
  let clicks = 0;
  let impressions = 0;
  let weightedPosition = 0;

  for (const row of rows) {
    clicks += row.clicks ?? 0;
    impressions += row.impressions ?? 0;
    weightedPosition += (row.position ?? 0) * (row.impressions ?? 0);
  }

  return {
    clicks,
    impressions,
    ctr: impressions ? clicks / impressions : 0,
    position: impressions ? weightedPosition / impressions : null,
  };
};

const inRange = (date: string, { start, end }: DateRange) =>
  date >= start && date <= end;

export const summarizeSearchDays = (
  rows: SearchRow[],
): Omit<SearchSummary, 'topQueries'> => {
  const dated = rows.filter((row) => row.keys?.[0]);
  const latestDate =
    dated
      .map((row) => row.keys![0])
      .sort()
      .at(-1) ?? null;

  if (!latestDate) {
    const empty = sumRows([]);
    return {
      latestDate: null,
      latest: empty,
      last7Range: null,
      last7: empty,
      prev7: empty,
    };
  }

  const last7Range = { start: addDays(latestDate, -6), end: latestDate };
  const prev7Range = {
    start: addDays(latestDate, -13),
    end: addDays(latestDate, -7),
  };
  const pick = (range: DateRange) =>
    dated.filter((row) => inRange(row.keys![0], range));

  return {
    latestDate,
    latest: sumRows(pick({ start: latestDate, end: latestDate })),
    last7Range,
    last7: sumRows(pick(last7Range)),
    prev7: sumRows(pick(prev7Range)),
  };
};

const query = (accessToken: string, body: unknown) =>
  callGoogleApi<{ rows?: SearchRow[] }>(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SEARCH_CONSOLE_SITE_URL)}/searchAnalytics/query`,
    accessToken,
    body,
  );

export const fetchSearchSummary = async (
  accessToken: string,
  period: ReportPeriod,
): Promise<SearchSummary> => {
  const byDate = await query(accessToken, {
    startDate: addDays(period.reportDate, -LOOKBACK_DAYS),
    endDate: period.yesterday,
    dimensions: ['date'],
    rowLimit: LOOKBACK_DAYS + 1,
  });
  const summary = summarizeSearchDays(byDate.rows ?? []);

  if (!summary.last7Range) {
    return { ...summary, topQueries: [] };
  }

  const queries = await query(accessToken, {
    startDate: summary.last7Range.start,
    endDate: summary.last7Range.end,
    dimensions: ['query'],
    rowLimit: QUERY_LIMIT,
  });

  return {
    ...summary,
    topQueries: (queries.rows ?? []).map((row) => ({
      label: row.keys?.[0] ?? '',
      value: row.impressions ?? 0,
    })),
  };
};
