import type { Metadata } from 'next';
import { localizePath } from '@/lib/i18n/config';
import { getEncodedPostPath } from '@/lib/posts/post-path';
import type { PublishedPost } from '@/lib/posts/queries';

/**
 * 게시글 상세의 메타데이터
 * - 대표 주소는 게시할 때의 언어 기준
 * - 일부 공개 글은 검색에 노출되지 않도록 noindex
 */
export const buildPostMetadata = (
  post: PublishedPost,
  origin: string,
): Metadata => {
  const url = `${origin.replace(/\/+$/, '')}${localizePath(post.locale, getEncodedPostPath(post))}`;

  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.excerpt,
      url,
      publishedTime: post.publishedAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      authors: [post.author.name],
    },
    ...(post.visibility === 'unlisted' ? { robots: { index: false } } : {}),
  };
};
