import type { NextRequest } from 'next/server';
import { parseModerationRequest } from '@/lib/posts/moderation';
import { applyModeration } from '@/lib/posts/moderation-queries';
import { revalidateSitemap } from '@/lib/seo/revalidate-sitemap';
import { isAuthorizedCronRequest } from '@/lib/seo/cron';

/**
 * 게시글 임시 조치·해제 (매일 새 게시글을 검수하는 클라우드 루틴이 호출)
 * - `Authorization: Bearer {MODERATION_SECRET}` 이 맞을 때만 (비밀값이 없으면 모두 거절)
 * - 본문: { target: 게시글 ID 또는 주소, action: 'ban' | 'unban', reason: 조치 사유(ban 필수) }
 * - 조치된 글은 목록·사이트맵에서 빠지고, 상세에는 임시 조치 안내만 보임
 */
export async function POST(request: NextRequest) {
  if (
    !isAuthorizedCronRequest(
      request.headers.get('authorization'),
      process.env.MODERATION_SECRET,
    )
  ) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const moderation = parseModerationRequest(body);

  if (!moderation) {
    return Response.json({ error: 'invalid_request' }, { status: 400 });
  }

  const result = await applyModeration(moderation);

  if (result === 'not_found') {
    return Response.json({ error: 'not_found' }, { status: 404 });
  }

  // 사이트맵은 캐시되므로 조치·해제를 바로 반영
  revalidateSitemap();

  return Response.json({ status: result, postId: moderation.postId });
}
