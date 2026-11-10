'use server';

import type { JSONContent } from '@tiptap/core';
import { and, eq, not, sql } from 'drizzle-orm';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { draft, post, type PostVisibility } from '@/lib/db/schema';
import {
  isDraftLocked,
  lockingJobExists,
  syncDraftJobs,
} from '@/lib/generation/jobs';
import { isLocale, type Locale } from '@/lib/i18n/config';
import { scheduleDraftImageCleanup } from '@/lib/images/cleanup';
import { parseImagePath, removeDisallowedImages } from '@/lib/images/rules';
import { checkPublishable } from '@/lib/posts/post-content';
import { createPostId } from '@/lib/posts/post-id';
import { buildPostValues, parsePostVisibility } from '@/lib/posts/post-values';
import { getPostFeedPage, type PostFeedPage } from '@/lib/posts/queries';
import { parseDraftDocument } from '@/lib/studio/draft-content';
import { isOwnedDraft } from '@/lib/studio/queries';
import { getSupabaseUrl } from '@/lib/supabase/server';

export type PublishDraftResult =
  | {
      status: 'published';
      id: string;
      slug: string;
      // 게시하면서 저장한 제목 (화면의 사이드바 제목을 맞추는 데 사용)
      title: string;
      visibility: PostVisibility;
    }
  // 아직 채우지 않은 빈칸이 남아 있음
  | { status: 'has_blanks'; count: number }
  | { status: 'no_title' }
  // 본문 형식이나 공개 범위, 언어가 올바르지 않음
  | { status: 'invalid' }
  // AI 작성 중이라 편집 잠금
  | { status: 'locked' }
  | { status: 'not_found' };

/**
 * 초안 게시 (다시 게시도 같은 액션)
 * - 화면 내용 그대로 게시되도록 초안 본문도 함께 저장 (잠금 조건은 자동 저장과 같음)
 * - 초안에는 편집기 본문 그대로, 게시글에는 정리한 본문 스냅샷을 저장
 * - 다시 게시하면 같은 게시글 행을 갱신: id 와 처음 게시한 시각은 유지
 * - 서버 액션 인자는 신뢰할 수 없으므로 공개 범위와 언어를 직접 확인
 * - 이미지는 초안 본문과 게시글 모두 그 사용자의 공개 버킷 주소만 남김
 * - 게시 후 응답 뒤에 쓰지 않는 이미지를 정리 (게시글 본문의 이미지도 쓰는 것으로 셈)
 */
export async function publishDraft(
  repositoryId: string,
  draftId: string,
  contentJson: string,
  visibility: PostVisibility,
  locale: Locale,
): Promise<PublishDraftResult> {
  const { user } = await requireSession();
  const parsed = parseDraftDocument(contentJson);
  const checkedVisibility = parsePostVisibility(visibility);

  if (!parsed || !checkedVisibility || !isLocale(locale)) {
    return { status: 'invalid' };
  }

  if (!(await isOwnedDraft(user.id, repositoryId, draftId))) {
    return { status: 'not_found' };
  }

  // 시간 초과된 작업 정리, 완료한 결과 반영 (반영되면 잠금이 풀림)
  await syncDraftJobs(draftId);

  const imageRule = { imageOwnerId: user.id, supabaseUrl: getSupabaseUrl() };

  // 순수 검사와 정리 단계: 잘못된 구조나 지나치게 깊은 중첩은 서버 오류가 아니라 invalid
  let content: JSONContent;
  let title: string;
  let values: ReturnType<typeof buildPostValues>;

  try {
    // 초안 본문도 DB 에 들어가므로 자동 저장과 같은 이미지 규칙으로 먼저 정리
    content = removeDisallowedImages(
      parsed,
      (src) =>
        parseImagePath(imageRule.supabaseUrl, src, imageRule.imageOwnerId) !==
        null,
    );

    const check = checkPublishable(content);

    if (check.status !== 'ok') {
      return check;
    }

    title = check.title;
    values = buildPostValues(
      content,
      title,
      locale,
      checkedVisibility,
      imageRule,
    );
  } catch {
    return { status: 'invalid' };
  }

  const result = await db.transaction(
    async (tx): Promise<PublishDraftResult> => {
      const [updated] = await tx
        .update(draft)
        .set({ content, title, status: 'published' })
        .where(and(eq(draft.id, draftId), not(lockingJobExists(draft.id))))
        .returning({ id: draft.id });

      // AI 작성 작업이 잠근 초안: 게시글을 쓰지 않고 끝냄
      if (!updated) {
        return { status: 'locked' };
      }

      const [published] = await tx
        .insert(post)
        .values({ id: createPostId(), draftId, userId: user.id, ...values })
        .onConflictDoUpdate({
          target: post.draftId,
          set: {
            title: values.title,
            slug: values.slug,
            excerpt: values.excerpt,
            content: values.content,
            visibility: values.visibility,
            locale: values.locale,
            updatedAt: sql`now()`,
          },
        })
        .returning({
          id: post.id,
          slug: post.slug,
          visibility: post.visibility,
        });

      return {
        status: 'published',
        id: published.id,
        slug: published.slug,
        title,
        visibility: published.visibility,
      };
    },
  );

  if (result.status === 'published') {
    scheduleDraftImageCleanup(draftId);
  }

  return result;
}

export type UnpublishDraftResult =
  | { status: 'unpublished' }
  // AI 작성 중이라 상태를 바꿀 수 없음
  | { status: 'locked' }
  | { status: 'not_found' };

/**
 * 게시 취소 (게시글 삭제 + 초안을 작성 중 상태로 되돌림)
 * - 초안 본문은 그대로 남음
 * - 게시 취소 후 응답 뒤에 쓰지 않는 이미지를 정리 (게시글에만 남아 있던 이미지)
 */
export async function unpublishDraft(
  repositoryId: string,
  draftId: string,
): Promise<UnpublishDraftResult> {
  const { user } = await requireSession();

  if (!(await isOwnedDraft(user.id, repositoryId, draftId))) {
    return { status: 'not_found' };
  }

  await syncDraftJobs(draftId);

  if (await isDraftLocked(draftId)) {
    return { status: 'locked' };
  }

  const result = await db.transaction(
    async (tx): Promise<UnpublishDraftResult> => {
      const deleted = await tx
        .delete(post)
        .where(and(eq(post.draftId, draftId), eq(post.userId, user.id)))
        .returning({ id: post.id });

      if (deleted.length === 0) {
        return { status: 'not_found' };
      }

      await tx
        .update(draft)
        .set({ status: 'draft' })
        .where(eq(draft.id, draftId));

      return { status: 'unpublished' };
    },
  );

  if (result.status === 'unpublished') {
    scheduleDraftImageCleanup(draftId);
  }

  return result;
}

/**
 * 전체 피드 무한 스크롤: 커서 다음의 공개 글 (로그인 불필요한 공개 조회)
 * - 서버 액션 인자는 신뢰할 수 없으므로 커서 형식은 조회 쪽에서 확인하고, 올바르지 않으면 빈 페이지
 */
export async function loadPostFeed(cursor: string): Promise<PostFeedPage> {
  return getPostFeedPage(String(cursor));
}
