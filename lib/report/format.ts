import type { RankItem, TrafficSummary, TrafficTotals } from '@/lib/report/ga4';
import type { DateRange, ReportPeriod } from '@/lib/report/period';
import type { SearchSummary, SearchTotals } from '@/lib/report/search-console';

/**
 * 일일 현황 보고 본문 (SNS 이메일, 일반 텍스트)
 * - 방문(GA4)·검색(Search Console)·서비스(운영 DB) 순서, 조회에 실패한 항목은 "조회 실패"로 적고 나머지는 그대로 보냄
 */

// 운영 DB 의 어제 하루 서비스 지표
export interface ServiceStats {
  newUsers: number;
  generations: number;
  completedGenerations: number;
  failedGenerations: number;
  publishedPosts: number;
}

export interface DailyReportInput {
  period: ReportPeriod;
  traffic: TrafficSummary | null;
  search: SearchSummary | null;
  service: ServiceStats | null;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const FAILED = '조회 실패';
const EMPTY_RANKING = '아직 없음';

// 2026-11-16 → 11/16
const shortDate = (date: string) => `${date.slice(5, 7)}/${date.slice(8, 10)}`;
const shortRange = ({ start, end }: DateRange) =>
  `${shortDate(start)}~${shortDate(end)}`;
const weekday = (date: string) =>
  WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

// 전일 대비 차이 (+1, -3, ±0)
const diff = (current: number, previous: number) => {
  const value = current - previous;
  return value === 0 ? '±0' : `${value > 0 ? '+' : ''}${value}`;
};

// 지난 7일 대비 증감률 (이전이 0 이면 비율을 낼 수 없어 신규)
const change = (current: number, previous: number) => {
  if (previous === 0) {
    return current === 0 ? '±0%' : '신규';
  }

  const percent = Math.round(((current - previous) / previous) * 100);
  return percent === 0 ? '±0%' : `${percent > 0 ? '+' : ''}${percent}%`;
};

const ranking = (items: RankItem[]) =>
  items.length
    ? items.map(({ label, value }) => `${label} ${value}`).join(' · ')
    : EMPTY_RANKING;

const percent = (ratio: number) => `${(ratio * 100).toFixed(1)}%`;
const position = (value: number | null) =>
  value === null ? '-' : value.toFixed(1);

const section = (title: string, lines: string[]) =>
  [`■ ${title}`, ...lines].join('\n');

const trafficTotalsLine = (current: TrafficTotals, previous: TrafficTotals) =>
  [
    `사용자 ${current.activeUsers} (${change(current.activeUsers, previous.activeUsers)})`,
    `세션 ${current.sessions} (${change(current.sessions, previous.sessions)})`,
    `페이지뷰 ${current.pageViews} (${change(current.pageViews, previous.pageViews)})`,
  ].join(' · ');

const trafficSection = (
  period: ReportPeriod,
  traffic: TrafficSummary | null,
) => {
  if (!traffic) {
    return section('방문 (GA4)', [FAILED]);
  }

  const { yesterday, dayBefore } = traffic;

  return section(`방문 (GA4 · 어제 ${shortDate(period.yesterday)})`, [
    [
      `활성 사용자 ${yesterday.activeUsers} (전일 ${diff(yesterday.activeUsers, dayBefore.activeUsers)})`,
      `세션 ${yesterday.sessions} (전일 ${diff(yesterday.sessions, dayBefore.sessions)})`,
      `페이지뷰 ${yesterday.pageViews} (전일 ${diff(yesterday.pageViews, dayBefore.pageViews)})`,
    ].join(' · '),
    `최근 7일(${shortRange(period.last7)}): ${trafficTotalsLine(traffic.last7, traffic.prev7)}`,
    `인기 페이지(7일): ${ranking(traffic.topPages)}`,
    `유입 경로(7일): ${ranking(traffic.topSources)}`,
  ]);
};

const searchTotalsLine = (current: SearchTotals, previous?: SearchTotals) =>
  [
    `클릭 ${current.clicks}${previous ? ` (${change(current.clicks, previous.clicks)})` : ''}`,
    `노출 ${current.impressions}${previous ? ` (${change(current.impressions, previous.impressions)})` : ''}`,
    `CTR ${percent(current.ctr)}`,
    `평균 순위 ${position(current.position)}`,
  ].join(' · ');

const searchSection = (search: SearchSummary | null) => {
  if (!search) {
    return section('검색 (Search Console)', [FAILED]);
  }

  if (!search.latestDate || !search.last7Range) {
    return section('검색 (Search Console)', ['아직 검색 데이터가 없습니다']);
  }

  return section(
    `검색 (Search Console · 확정된 최근 날짜 ${shortDate(search.latestDate)})`,
    [
      searchTotalsLine(search.latest),
      `최근 7일(${shortRange(search.last7Range)}): ${searchTotalsLine(search.last7, search.prev7)}`,
      `인기 검색어(7일, 노출): ${ranking(search.topQueries)}`,
    ],
  );
};

const serviceSection = (period: ReportPeriod, service: ServiceStats | null) => {
  if (!service) {
    return section('서비스 (운영 DB)', [FAILED]);
  }

  return section(`서비스 (운영 DB · 어제 ${shortDate(period.yesterday)})`, [
    [
      `신규 가입 ${service.newUsers}`,
      `AI 작성 요청 ${service.generations} (완료 ${service.completedGenerations} · 실패 ${service.failedGenerations})`,
      `새 게시글 ${service.publishedPosts}`,
    ].join(' · '),
  ]);
};

export const buildDailyReport = ({
  period,
  traffic,
  search,
  service,
}: DailyReportInput) => ({
  // SNS 이메일 제목은 100자 미만·줄바꿈 없이, 메일 앱 호환을 위해 ASCII 로만 씀
  subject: `[comdraft] Daily report ${period.reportDate}`,
  message: [
    `[comdraft] 일일 현황 · ${period.reportDate} (${weekday(period.reportDate)})`,
    trafficSection(period, traffic),
    searchSection(search),
    serviceSection(period, service),
  ].join('\n\n'),
});
