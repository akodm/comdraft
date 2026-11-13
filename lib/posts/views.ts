import 'server-only';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { post, postView } from '@/lib/db/schema';
import { POST_VIEW_WINDOW_DAYS } from '@/lib/posts/post-view';

/** 조회 수를 셀 때 필요한 게시글 정보 (게시된 글이 없으면 null) */
export const getPostAuthorId = async (
  postId: string,
): Promise<string | null> => {
  const [row] = await db
    .select({ userId: post.userId })
    .from(post)
    .where(eq(post.id, postId))
    .limit(1);

  return row?.userId ?? null;
};

/**
 * 같은 사람의 최근 기록이 없을 때만 조회 한 줄을 남긴다. 남겼으면 true
 * - 같은 글·같은 사람의 동시 요청이 둘 다 남기지 않도록 트랜잭션 잠금 안에서 확인 후 삽입
 */
export const recordViewIfDue = async (
  postId: string,
  viewerKey: string,
): Promise<boolean> => {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`${postId}:${viewerKey}`}, 0))`,
    );

    const [recent] = await tx
      .select({ id: postView.id })
      .from(postView)
      .where(
        and(
          eq(postView.postId, postId),
          eq(postView.viewerKey, viewerKey),
          gt(
            postView.viewedAt,
            sql`now() - make_interval(days => ${POST_VIEW_WINDOW_DAYS})`,
          ),
        ),
      )
      .limit(1);

    if (recent) return false;

    await tx.insert(postView).values({ postId, viewerKey });

    return true;
  });
};
