'use server';

import { cookies, headers } from 'next/headers';
import { getSession } from '@/lib/auth/session';
import { isPostId } from '@/lib/posts/post-id';
import { getViewerKey, VIEWER_COOKIE } from '@/lib/posts/post-view';
import { verifyViewerCookie } from '@/lib/posts/viewer-cookie';
import { consumeAnonymousViewAttempt } from '@/lib/posts/view-limit';
import { getPostAuthorId, recordViewIfDue } from '@/lib/posts/views';
import { getClientIp } from '@/lib/request-ip';

/**
 * 게시글 상세가 브라우저에서 열린 뒤 조회를 기록한다 (화면에 결과를 알리지 않음)
 * - 없는 글, 글쓴이 본인, 서명이 맞는 쿠키가 없는 비로그인, 30일 안에 이미 센 사람은 기록하지 않음
 * - 쿠키는 서명을 검증한 뒤 uuid 부분만 방문자 ID 로 씀
 * - 비로그인 조회는 IP 당 횟수를 제한 (쿠키를 버리며 반복하는 부풀리기 방지)
 */
export async function recordPostView(postId: string): Promise<void> {
  if (typeof postId !== 'string' || !isPostId(postId)) return;

  try {
    const authorId = await getPostAuthorId(postId);

    if (!authorId) return;

    const session = await getSession();
    const viewerKey = getViewerKey({
      sessionUserId: session?.user.id ?? null,
      viewerId:
        verifyViewerCookie(
          (await cookies()).get(VIEWER_COOKIE)?.value,
          process.env.BETTER_AUTH_SECRET,
        ) ?? undefined,
      authorId,
    });

    if (!viewerKey) return;

    if (
      !session &&
      !(await consumeAnonymousViewAttempt(getClientIp(await headers())))
    ) {
      return;
    }

    await recordViewIfDue(postId, viewerKey);
  } catch {
    // 조회 기록 실패는 글 읽기에 영향을 주지 않음
  }
}
