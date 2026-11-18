import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { post } from '@/lib/db/schema';
import type { ModerationRequest } from '@/lib/posts/moderation';

export type ModerationResult = 'banned' | 'unbanned' | 'not_found';

/**
 * 게시글 임시 조치·해제 (본문·제목·공개 범위는 건드리지 않음)
 * - ban: 처음 조치한 시각은 유지하고 사유만 갱신
 * - unban: 조치 시각과 사유를 비움
 */
export const applyModeration = async ({
  postId,
  action,
  reason,
}: ModerationRequest): Promise<ModerationResult> => {
  const values =
    action === 'ban'
      ? { bannedAt: sql`coalesce(${post.bannedAt}, now())`, banReason: reason }
      : { bannedAt: null, banReason: null };

  const rows = await db
    .update(post)
    .set(values)
    .where(eq(post.id, postId))
    .returning({ id: post.id });

  if (rows.length === 0) {
    return 'not_found';
  }

  return action === 'ban' ? 'banned' : 'unbanned';
};
