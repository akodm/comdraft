import type { NextRequest } from 'next/server';
import { isAuthorizedCronRequest } from '@/lib/seo/cron';
import { revalidateSitemap } from '@/lib/seo/revalidate-sitemap';

/**
 * 주간 사이트맵 갱신 (Vercel Cron, vercel.json: 일요일 0시 한국 시간 = 토요일 15시 UTC)
 * - 게시·게시 취소 때 바로 갱신하지만, 놓친 변경이 있어도 일주일 안에 맞춰지도록 한 번 더 다시 만듦
 * - Vercel 이 붙이는 `Authorization: Bearer {CRON_SECRET}` 이 맞을 때만 실행
 */
export function GET(request: NextRequest) {
  if (
    !isAuthorizedCronRequest(
      request.headers.get('authorization'),
      process.env.CRON_SECRET,
    )
  ) {
    return new Response('Unauthorized', { status: 401 });
  }

  revalidateSitemap();

  return Response.json({ revalidated: true });
}
