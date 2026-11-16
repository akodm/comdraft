import type { NextRequest } from 'next/server';
import { runDailyReport } from '@/lib/report/run';
import { isAuthorizedCronRequest } from '@/lib/seo/cron';

/**
 * 일일 현황 보고 (Vercel Schedules `daily-report`, vercel.json: 매일 08시 한국 시간, 15분 안의 지연 허용)
 * - GA4·Search Console·운영 DB 현황을 텍스트로 정리해 SNS 토픽으로 이메일 발행
 * - Vercel 이 붙이는 `Authorization: Bearer {CRON_SECRET}` 이 맞을 때만 실행
 */
export async function GET(request: NextRequest) {
  if (
    !isAuthorizedCronRequest(
      request.headers.get('authorization'),
      process.env.CRON_SECRET,
    )
  ) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    return Response.json(await runDailyReport());
  } catch (error) {
    // 설정 누락이나 SNS 발행 실패 (메시지에 비밀값 없음)
    console.error(
      '[daily-report] 보고 실패:',
      error instanceof Error ? error.message : error,
    );
    return Response.json({ error: 'daily_report_failed' }, { status: 500 });
  }
}
