import 'server-only';
import { buildDailyReport } from '@/lib/report/format';
import { fetchTrafficSummary } from '@/lib/report/ga4';
import { fetchGoogleAccessToken } from '@/lib/report/google-auth';
import { getReportPeriod } from '@/lib/report/period';
import { fetchSearchSummary } from '@/lib/report/search-console';
import { fetchServiceStats } from '@/lib/report/service-stats';
import { publishToSns } from '@/lib/report/sns';

/**
 * 일일 현황 보고 실행 (매일 아침 Vercel Schedules `daily-report`)
 * - GA4·Search Console·운영 DB 를 함께 조회하고, 실패한 항목만 "조회 실패"로 둔 채 SNS 로 이메일 발행
 * - 비밀 키·토큰은 로그에 남기지 않고 실패 이유(서비스·상태 코드)만 남김
 */

// 보고용 서비스 계정 (GCP 프로젝트 comdraft-514908, GA4 뷰어·Search Console 제한됨 권한, 비밀값 아님)
export const REPORT_SERVICE_ACCOUNT_EMAIL =
  'comdraft-reporter@comdraft-514908.iam.gserviceaccount.com';

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/analytics.readonly',
  'https://www.googleapis.com/auth/webmasters.readonly',
];

export interface DailyReportConfig {
  googlePrivateKey: string;
  topicArn: string;
  accessKeyId: string;
  secretAccessKey: string;
}

// SNS 발행은 작성 Lambda 호출과 같은 invoker 키를 씀 (GENERATION_AWS_*)
export const readDailyReportConfig = (
  env: NodeJS.ProcessEnv = process.env,
): DailyReportConfig => {
  const googlePrivateKey = env.GOOGLE_REPORT_PRIVATE_KEY;
  const topicArn = env.DAILY_REPORT_TOPIC_ARN;
  const accessKeyId = env.GENERATION_AWS_ACCESS_KEY_ID;
  const secretAccessKey = env.GENERATION_AWS_SECRET_ACCESS_KEY;

  if (!googlePrivateKey || !topicArn || !accessKeyId || !secretAccessKey) {
    throw new Error(
      '일일 현황 보고 설정(GOOGLE_REPORT_PRIVATE_KEY, DAILY_REPORT_TOPIC_ARN, GENERATION_AWS_ACCESS_KEY_ID, GENERATION_AWS_SECRET_ACCESS_KEY)이 없습니다.',
    );
  }

  return { googlePrivateKey, topicArn, accessKeyId, secretAccessKey };
};

const settled = <T>(label: string, result: PromiseSettledResult<T>) => {
  if (result.status === 'fulfilled') {
    return result.value;
  }

  console.error(
    `[daily-report] ${label} 조회 실패:`,
    result.reason instanceof Error ? result.reason.message : result.reason,
  );
  return null;
};

export const runDailyReport = async (
  config: DailyReportConfig = readDailyReportConfig(),
  now: Date = new Date(),
) => {
  const period = getReportPeriod(now);
  const accessToken = fetchGoogleAccessToken(
    {
      clientEmail: REPORT_SERVICE_ACCOUNT_EMAIL,
      privateKey: config.googlePrivateKey,
    },
    GOOGLE_SCOPES,
  );

  const [traffic, search, service] = await Promise.allSettled([
    accessToken.then((token) => fetchTrafficSummary(token, period)),
    accessToken.then((token) => fetchSearchSummary(token, period)),
    fetchServiceStats(period.yesterdayRange),
  ]);

  const report = buildDailyReport({
    period,
    traffic: settled('GA4', traffic),
    search: settled('Search Console', search),
    service: settled('운영 DB', service),
  });

  await publishToSns(config, report.subject, report.message);

  return {
    reportDate: period.reportDate,
    sections: {
      traffic: traffic.status,
      search: search.status,
      service: service.status,
    },
  };
};
