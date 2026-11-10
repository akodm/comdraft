import 'server-only';
import { cache } from 'react';
import { eq } from 'drizzle-orm';
import type { JSONContent } from '@tiptap/core';
import { db } from '@/lib/db';
import { post, user, type PostVisibility } from '@/lib/db/schema';
import type { Locale } from '@/lib/i18n/config';

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
