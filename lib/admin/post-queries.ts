import 'server-only';
import { requireAdmin } from '@/lib/admin/guard';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { ADMIN_PAGE_SIZE } from '@/lib/admin/pagination';
import { escapeLike } from '@/lib/admin/search';
import { db } from '@/lib/db';
import { adminAccount, adminActionLog } from '@/lib/db/schema/admin';
import { user } from '@/lib/db/schema/auth';
import { post, postView, POST_VISIBILITIES } from '@/lib/db/schema/post';
import type { PostVisibility } from '@/lib/db/schema/post';
import { LOCALES } from '@/lib/i18n/config';
import type { Locale } from '@/lib/i18n/config';

/**
 * 어드민 게시글 조회 (읽기 전용)
 */

const DETAIL_ACTION_LIMIT = 20;

export interface PostListFilters {
  q: string;
  visibility: PostVisibility | null;
  locale: Locale | null;
  page: number;
}

// 쿼리 문자열 값이 허용 목록에 있을 때만 필터로 씀
export const parseVisibility = (value: string): PostVisibility | null =>
  POST_VISIBILITIES.find((item) => item === value) ?? null;

export const parsePostLocale = (value: string): Locale | null =>
  LOCALES.find((item) => item === value) ?? null;

// 글마다 센 조회 수 (post_view 한 줄이 조회 한 번)
const viewCountSql = sql<number>`(select count(*)::int from ${postView} where ${postView.postId} = ${post.id})`;

export interface PostListRow {
  id: string;
  title: string;
  visibility: PostVisibility;
  locale: Locale;
  publishedAt: Date;
  bannedAt: Date | null;
  authorEmail: string;
  authorGithubLogin: string | null;
  viewCount: number;
}

/**
 * 게시글 목록 (제목·작성자 부분 일치, 공개 범위·언어 필터, 게시 최신순, 50개씩)
 * - 본문은 읽지 않음
 */
export const listPosts = async ({
  q,
  visibility,
  locale,
  page,
}: PostListFilters): Promise<{ rows: PostListRow[]; total: number }> => {
  // 페이지를 거치지 않는 호출(에이전트 도구 등)도 여기서 조회 권한(view)을 확인
  await requireAdmin('view');

  const term = q.trim();
  const pattern = `%${escapeLike(term)}%`;
  const where = and(
    term
      ? or(
          ilike(post.title, pattern),
          ilike(user.email, pattern),
          ilike(user.githubLogin, pattern),
        )
      : undefined,
    visibility ? eq(post.visibility, visibility) : undefined,
    locale ? eq(post.locale, locale) : undefined,
  );

  const [[totals], rows] = await Promise.all([
    db
      .select({ total: count() })
      .from(post)
      .innerJoin(user, eq(user.id, post.userId))
      .where(where),
    db
      .select({
        id: post.id,
        title: post.title,
        visibility: post.visibility,
        locale: post.locale,
        publishedAt: post.publishedAt,
        bannedAt: post.bannedAt,
        authorEmail: user.email,
        authorGithubLogin: user.githubLogin,
        viewCount: viewCountSql,
      })
      .from(post)
      .innerJoin(user, eq(user.id, post.userId))
      .where(where)
      .orderBy(desc(post.publishedAt), desc(post.id))
      .limit(ADMIN_PAGE_SIZE)
      .offset((Math.max(1, page) - 1) * ADMIN_PAGE_SIZE),
  ]);

  return { total: totals.total, rows };
};

export interface PostDetail {
  post: {
    id: string;
    title: string;
    slug: string;
    visibility: PostVisibility;
    locale: Locale;
    publishedAt: Date;
    updatedAt: Date;
    bannedAt: Date | null;
    banReason: string | null;
    draftId: string;
  };
  author: { id: string; email: string; githubLogin: string | null };
  viewCount: number;
  actions: Array<{
    id: string;
    loginId: string | null;
    action: string;
    detail: Record<string, unknown>;
    createdAt: Date;
  }>;
}

// 게시글 상세 (없으면 null, 본문은 읽지 않음)
export const getPostDetail = async (
  postId: string,
): Promise<PostDetail | null> => {
  // 페이지를 거치지 않는 호출(에이전트 도구 등)도 여기서 조회 권한(view)을 확인
  await requireAdmin('view');

  const [found] = await db
    .select({
      id: post.id,
      title: post.title,
      slug: post.slug,
      visibility: post.visibility,
      locale: post.locale,
      publishedAt: post.publishedAt,
      updatedAt: post.updatedAt,
      bannedAt: post.bannedAt,
      banReason: post.banReason,
      draftId: post.draftId,
      authorId: user.id,
      authorEmail: user.email,
      authorGithubLogin: user.githubLogin,
      viewCount: viewCountSql,
    })
    .from(post)
    .innerJoin(user, eq(user.id, post.userId))
    .where(eq(post.id, postId))
    .limit(1);

  if (!found) {
    return null;
  }

  const actions = await db
    .select({
      id: adminActionLog.id,
      loginId: adminAccount.loginId,
      action: adminActionLog.action,
      detail: adminActionLog.detail,
      createdAt: adminActionLog.createdAt,
    })
    .from(adminActionLog)
    .leftJoin(adminAccount, eq(adminAccount.id, adminActionLog.adminId))
    .where(
      and(
        eq(adminActionLog.targetType, 'post'),
        eq(adminActionLog.targetId, postId),
      ),
    )
    .orderBy(desc(adminActionLog.createdAt))
    .limit(DETAIL_ACTION_LIMIT);

  const { authorId, authorEmail, authorGithubLogin, viewCount, ...rest } =
    found;

  return {
    post: rest,
    author: {
      id: authorId,
      email: authorEmail,
      githubLogin: authorGithubLogin,
    },
    viewCount,
    actions,
  };
};
