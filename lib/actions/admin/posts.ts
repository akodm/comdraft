'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { draft } from '@/lib/db/schema/draft';
import { post } from '@/lib/db/schema/post';
import { logAdminAction } from '@/lib/admin/audit';
import { requireAdmin, requireAdminKey } from '@/lib/admin/guard';
import { adminPath } from '@/lib/admin/path-key';
import type { AdminAction } from '@/lib/admin/roles';
import { getRequestLocale } from '@/lib/i18n/request';
import { applyModeration } from '@/lib/posts/moderation-queries';
import { revalidateSitemap } from '@/lib/seo/revalidate-sitemap';

// 밴 사유 최대 길이 (ConfirmActionButton 의 입력 제한과 같은 기준)
const REASON_MAX_LENGTH = 500;

const readField = (formData: FormData, name: string): string => {
  const value = formData.get(name);

  return typeof value === 'string' ? value : '';
};

// 대상 게시글 id (없으면 오류)
const readPostId = (formData: FormData): string => {
  const postId = readField(formData, 'postId').trim();

  if (!postId) {
    throw new Error('invalid_post');
  }

  return postId;
};

// 밴 사유 (앞뒤 공백을 떼고 1~500자만 허용)
const readReason = (formData: FormData): string => {
  const reason = readField(formData, 'reason').trim();

  if (reason.length < 1 || reason.length > REASON_MAX_LENGTH) {
    throw new Error('invalid_reason');
  }

  return reason;
};

// 목록과 해당 게시글 상세를 다시 읽도록 표시
const revalidatePost = async (postId: string): Promise<void> => {
  const base = adminPath(await getRequestLocale(), requireAdminKey(), 'posts');

  revalidatePath(base);
  revalidatePath(`${base}/${postId}`);
};

// 권한 확인 → 대상 id 읽기 (모든 액션의 공통 시작)
const begin = async (formData: FormData, action: AdminAction) => {
  const admin = await requireAdmin(action);

  return { admin, postId: readPostId(formData) };
};

/** 게시글 밴: 목록·사이트맵에서 빼고 상세에는 안내만 보이게 함 (검수 API 와 같은 동작) */
export async function banPost(formData: FormData): Promise<void> {
  const { admin, postId } = await begin(formData, 'post.ban');
  const reason = readReason(formData);

  const result = await applyModeration({ postId, action: 'ban', reason });

  if (result === 'not_found') {
    throw new Error('unknown_post');
  }

  revalidateSitemap();
  await logAdminAction({
    adminId: admin.adminId,
    action: 'post.ban',
    targetType: 'post',
    targetId: postId,
    detail: { reason },
  });
  await revalidatePost(postId);
}

/** 게시글 밴 해제 */
export async function unbanPost(formData: FormData): Promise<void> {
  const { admin, postId } = await begin(formData, 'post.unban');

  const result = await applyModeration({
    postId,
    action: 'unban',
    reason: null,
  });

  if (result === 'not_found') {
    throw new Error('unknown_post');
  }

  revalidateSitemap();
  await logAdminAction({
    adminId: admin.adminId,
    action: 'post.unban',
    targetType: 'post',
    targetId: postId,
  });
  await revalidatePost(postId);
}

/**
 * 게시글 삭제 (admin): 게시글 행을 지우고 원래 초안을 draft 상태로 되돌림
 * - 조회 기록(post_view)은 외래 키 cascade 로 함께 지워짐
 * - 기록에는 제목만 남김 (본문은 남기지 않음)
 */
export async function deletePost(formData: FormData): Promise<void> {
  const { admin, postId } = await begin(formData, 'post.delete');

  const removed = await db.transaction(async (tx) => {
    const [deleted] = await tx
      .delete(post)
      .where(eq(post.id, postId))
      .returning({ id: post.id, draftId: post.draftId, title: post.title });

    if (!deleted) {
      throw new Error('unknown_post');
    }

    await tx
      .update(draft)
      .set({ status: 'draft' })
      .where(eq(draft.id, deleted.draftId));

    return deleted;
  });

  revalidateSitemap();
  await logAdminAction({
    adminId: admin.adminId,
    action: 'post.delete',
    targetType: 'post',
    targetId: postId,
    detail: { title: removed.title },
  });
  await revalidatePost(postId);
}
