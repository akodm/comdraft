import type { NextRequest } from 'next/server';
import { removeExpiredUploads } from '@/lib/images/storage';
import { isAuthorizedCronRequest } from '@/lib/seo/cron';
import { flushReports, reportError } from '@/lib/observability/report-error';

/**
 * 임시 업로드 정리 (Vercel Schedules `uploads-cleanup`, vercel.json: 매일 04시 한국 시간)
 * - Hobby 플랜은 하루 한 번보다 잦은 스케줄을 받지 않으므로 매일 실행 (지우는 기준은 그대로 만든 지 1시간)
 * - 임시 버킷(comdraft-uploads)에서 만든 지 1시간이 지난 원본을 지움 (서명 주소만 받고 마무리하지 않은 원본)
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
    return Response.json({ removed: await removeExpiredUploads() });
  } catch (error) {
    // Storage 목록 조회·삭제 실패 (메시지에 비밀값 없음)
    console.error(
      '[uploads-cleanup] 정리 실패:',
      error instanceof Error ? error.message : error,
    );
    reportError(error, 'cron.uploads-cleanup');
    await flushReports();
    return Response.json({ error: 'uploads_cleanup_failed' }, { status: 500 });
  }
}
