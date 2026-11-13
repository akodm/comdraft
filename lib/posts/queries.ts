import 'server-only';
import { cache } from 'react';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { JSONContent } from '@tiptap/core';
import { db } from '@/lib/db';
import { draft, post, user, type PostVisibility } from '@/lib/db/schema';
import type { Locale } from '@/lib/i18n/config';
import { POST_LIST_PAGE_SIZE } from '@/lib/posts/post-list';

export interface PublishedPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: JSONContent;
  visibility: PostVisibility;
  locale: Locale;
  publishedAt: Date;
  updatedAt: Date;
  // githubLogin: 작성자 GitHub 프로필 링크용 (기존 사용자는 채우기 전까지 null)
  author: { name: string; image: string | null; githubLogin: string | null };
}

/**
 * 게시글 상세 조회 (공개와 일부 공개 모두, 주소를 아는 사람만 열 수 있음)
 * - React cache 로 감싸 generateMetadata 와 페이지가 한 요청에서 한 번만 조회
 */
export const getPublishedPost = cache(
  async (id: string): Promise<PublishedPost | null> => {
    const [row] = await db
      .select({
        id: post.id,
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        content: post.content,
        visibility: post.visibility,
        locale: post.locale,
        publishedAt: post.publishedAt,
        updatedAt: post.updatedAt,
        authorName: user.name,
        authorImage: user.image,
        authorGithubLogin: user.githubLogin,
      })
      .from(post)
      .innerJoin(user, eq(post.userId, user.id))
      .where(eq(post.id, id))
      .limit(1);

    if (!row) return null;

    const { authorName, authorImage, authorGithubLogin, content, ...rest } =
      row;

    return {
      ...rest,
      content: content as JSONContent,
      author: {
        name: authorName,
        image: authorImage,
        githubLogin: authorGithubLogin,
      },
    };
  },
);

export interface PostListItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  // 본문의 첫 번째 이미지 주소 (게시 때 공개 버킷 주소로 정리됨, 없으면 null)
  thumbnailUrl: string | null;
}

export interface PostListPage {
  posts: PostListItem[];
  // 전체 쪽 수 (공개 글이 없으면 0)
  totalPages: number;
}

/**
 * 게시글 목록 한 쪽 (공개 글만, 처음 게시한 시각 최신순, 쪽 번호 기반)
 * - 같은 시각이면 ID 역순으로 정렬해 쪽 사이에 빠지거나 겹치는 글이 없음
 * - 썸네일은 본문 전체를 가져오지 않고 DB 에서 첫 이미지 주소만 뽑음 (인용구 등 안쪽 이미지도 본문 순서대로)
 */
export const getPostListPage = async (page: number): Promise<PostListPage> => {
  const isPublic = eq(post.visibility, 'public');

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: post.id,
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        thumbnailUrl: sql<
          string | null
        >`nullif(jsonb_path_query_first(${post.content}, 'strict $.**?(@.type == "image").attrs.src') #>> '{}', '')`,
      })
      .from(post)
      .where(isPublic)
      .orderBy(desc(post.publishedAt), desc(post.id))
      .limit(POST_LIST_PAGE_SIZE)
      .offset((page - 1) * POST_LIST_PAGE_SIZE),
    db.select({ total: count() }).from(post).where(isPublic),
  ]);

  return {
    posts: rows,
    totalPages: Math.ceil(total / POST_LIST_PAGE_SIZE),
  };
};

/** 사이트맵에 넣을 공개 글의 대표 주소 정보 (일부 공개 글은 제외) */
export const listPublicPostPaths = async (): Promise<
  Array<{ id: string; slug: string; locale: Locale; updatedAt: Date }>
> => {
  return db
    .select({
      id: post.id,
      slug: post.slug,
      locale: post.locale,
      updatedAt: post.updatedAt,
    })
    .from(post)
    .where(eq(post.visibility, 'public'))
    .orderBy(desc(post.publishedAt), desc(post.id));
};

/**
 * 저장소 연결을 해제하면 함께 삭제되는 초안과 게시글 수
 * - 게시글은 초안에 딸려 있어 초안이 지워지면 같이 지워짐
 */
export const countRepositoryContent = async (
  userId: string,
  repositoryId: string,
): Promise<{ drafts: number; posts: number }> => {
  const ownDrafts = and(
    eq(draft.userId, userId),
    eq(draft.repositoryId, repositoryId),
  );

  const [drafts, [postRow]] = await Promise.all([
    db.$count(draft, ownDrafts),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(post)
      .innerJoin(draft, eq(post.draftId, draft.id))
      .where(ownDrafts),
  ]);

  return { drafts, posts: postRow?.count ?? 0 };
};
