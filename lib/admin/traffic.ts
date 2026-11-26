import 'server-only';
import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { unstable_cache } from 'next/cache';
import { requireAdmin } from '@/lib/admin/guard';
import { VIEW_TIMEZONE, viewRangeStart } from '@/lib/admin/post-views';
import type { ViewRange } from '@/lib/admin/post-views';
import { reportError } from '@/lib/observability/report-error';
import { fetchDailyTraffic } from '@/lib/report/ga4';
import type { DailyTraffic } from '@/lib/report/ga4';
import {
  fetchGoogleAccessToken,
  readServiceAccountPrivateKey,
} from '@/lib/report/google-auth';
import { REPORT_SERVICE_ACCOUNT_EMAIL } from '@/lib/report/run';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 어드민 사이트 트래픽 (GA4 일별 방문자·세션·페이지뷰)
 * - 일일 현황 보고와 같은 서비스 계정(GOOGLE_REPORT_CREDENTIALS)으로 조회
 * - GA4 호출 한도를 아끼려고 기간별 결과를 1시간 캐시 (비밀 키는 캐시 키에 넣지 않도록 캐시 안에서 읽음)
 */

const ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const CACHE_SECONDS = 3600;

export type TrafficResult =
  | { status: 'ok'; data: DailyTraffic[] }
  // 환경 변수가 없음 (로컬 등)
  | { status: 'unconfigured' }
  | { status: 'error' };

const loadDailyTraffic = unstable_cache(
  async (start: string, end: string): Promise<DailyTraffic[]> => {
    const credentials = process.env.GOOGLE_REPORT_CREDENTIALS ?? '';
    const accessToken = await fetchGoogleAccessToken(
      {
        clientEmail: REPORT_SERVICE_ACCOUNT_EMAIL,
        privateKey: readServiceAccountPrivateKey(credentials),
      },
      [ANALYTICS_SCOPE],
    );

    return fetchDailyTraffic(accessToken, { start, end });
  },
  ['admin-daily-traffic'],
  { revalidate: CACHE_SECONDS },
);

// 오늘을 포함한 days 일 (한국 시간)
export const getDailyTraffic = async (
  days: ViewRange,
  now: Date = new Date(),
): Promise<TrafficResult> => {
  // 페이지를 거치지 않는 호출(에이전트 도구 등)도 여기서 조회 권한(view)을 확인
  await requireAdmin('view');

  if (!process.env.GOOGLE_REPORT_CREDENTIALS) {
    return { status: 'unconfigured' };
  }

  const start = dayjs(viewRangeStart(now, days))
    .tz(VIEW_TIMEZONE)
    .format('YYYY-MM-DD');
  const end = dayjs(now).tz(VIEW_TIMEZONE).format('YYYY-MM-DD');

  try {
    return { status: 'ok', data: await loadDailyTraffic(start, end) };
  } catch (error) {
    reportError(error, 'admin.traffic');
    return { status: 'error' };
  }
};
