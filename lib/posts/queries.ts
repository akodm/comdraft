import 'server-only';
import { cache } from 'react';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { JSONContent } from '@tiptap/core';
import { db } from '@/lib/db';
import { draft, post, user, type PostVisibility } from '@/lib/db/schema';
import type { Locale } from '@/lib/i18n/config';
import {
  decodeFeedCursor,
  encodeFeedCursor,
  POST_FEED_PAGE_SIZE,
} from '@/lib/posts/feed-cursor';

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
  author: { name: string; image: string | null };
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
      })
      .from(post)
      .innerJoin(user, eq(post.userId, user.id))
      .where(eq(post.id, id))
      .limit(1);

    if (!row) return null;

    const { authorName, authorImage, content, ...rest } = row;

    return {
      ...rest,
      content: content as JSONContent,
      author: { name: authorName, image: authorImage },
    };
  },
);

export interface PostFeedItem {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  publishedAt: Date;
  author: { name: string; image: string | null };
}

export interface PostFeedPage {
  posts: PostFeedItem[];
  // 다음 페이지가 없으면 null
  nextCursor: string | null;
}

/**
 * 전체 피드 한 페이지 (공개 글만, 처음 게시한 시각 최신순, 커서 기반)
 * - 같은 시각이면 ID 역순으로 정렬해 순서가 항상 같고, 페이지 사이에 빠지거나 겹치는 글이 없음
 * - post_public_published_idx (published_at desc, id desc, 공개 글만) 를 그대로 탈 수 있는 조건과 정렬
 * - published_at 은 밀리초 정밀도라 JS Date 로 만든 커서와 그대로 비교 가능
 * - 커서가 올바르지 않으면 빈 페이지
 */
export const getPostFeedPage = async (
  cursor: string | null = null,
): Promise<PostFeedPage> => {
  const after = cursor === null ? null : decodeFeedCursor(cursor);

  if (cursor !== null && !after) {
    return { posts: [], nextCursor: null };
  }

  const rows = await db
    .select({
      id: post.id,
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      publishedAt: post.publishedAt,
      authorName: user.name,
      authorImage: user.image,
    })
    .from(post)
    .innerJoin(user, eq(post.userId, user.id))
    .where(
      and(
        eq(post.visibility, 'public'),
        after
          ? sql`(${post.publishedAt}, ${post.id}) < (${after.publishedAt.toISOString()}::timestamptz, ${after.id})`
          : undefined,
      ),
    )
    .orderBy(desc(post.publishedAt), desc(post.id))
    // 한 개 더 조회해 다음 페이지 존재 여부 확인
    .limit(POST_FEED_PAGE_SIZE + 1);

  const page = rows.slice(0, POST_FEED_PAGE_SIZE);
  const last = page.at(-1);

  return {
    posts: page.map(({ authorName, authorImage, ...rest }) => ({
      ...rest,
      author: { name: authorName, image: authorImage },
    })),
    nextCursor:
      rows.length > POST_FEED_PAGE_SIZE && last
        ? encodeFeedCursor({ publishedAt: last.publishedAt, id: last.id })
        : null,
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
