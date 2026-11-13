'use server';

import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth/session';
import { isPostId } from '@/lib/posts/post-id';
import { getViewerKey, VIEWER_COOKIE } from '@/lib/posts/post-view';
import { getPostAuthorId, recordViewIfDue } from '@/lib/posts/views';

/**
 * 게시글 상세가 브라우저에서 열린 뒤 조회를 기록한다 (화면에 결과를 알리지 않음)
 * - 없는 글, 글쓴이 본인, 쿠키 없는 비로그인, 30일 안에 이미 센 사람은 기록하지 않음
 */
export async function recordPostView(postId: string): Promise<void> {
  if (typeof postId !== 'string' || !isPostId(postId)) return;

  try {
    const authorId = await getPostAuthorId(postId);

    if (!authorId) return;

    const session = await getSession();
    const viewerKey = getViewerKey({
      sessionUserId: session?.user.id ?? null,
      viewerId: (await cookies()).get(VIEWER_COOKIE)?.value,
      authorId,
    });

    if (!viewerKey) return;

    await recordViewIfDue(postId, viewerKey);
  } catch {
    // 조회 기록 실패는 글 읽기에 영향을 주지 않음
  }
}
