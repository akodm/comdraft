import type { Metadata } from 'next';
import { localizePath } from '@/lib/i18n/config';
import { getEncodedPostPath } from '@/lib/posts/post-path';
import type { PublishedPost } from '@/lib/posts/queries';
import { OG_LOCALES, SITE_NAME } from '@/lib/seo/site';

/** 절대 주소에 쓸 사이트 origin (끝의 `/` 제거, 설정이 없으면 undefined) */
export const getSiteOrigin = (): string | undefined =>
  process.env.BETTER_AUTH_URL?.replace(/\/+$/, '');

/**
 * 게시글 상세의 메타데이터
 * - 대표 주소는 게시할 때의 언어 기준
 * - 일부 공개 글은 검색에 노출되지 않도록 noindex
 * - 기술 태그는 키워드와 article:tag 로 (오픈그래프 이미지는 같은 경로의 opengraph-image 가 채움)
 */
export const buildPostMetadata = (
  post: PublishedPost,
  origin: string,
): Metadata => {
  const url = `${origin.replace(/\/+$/, '')}${localizePath(post.locale, getEncodedPostPath(post))}`;

  return {
    title: post.title,
    description: post.excerpt,
    ...(post.tags.length > 0 ? { keywords: post.tags } : {}),
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      siteName: SITE_NAME,
      locale: OG_LOCALES[post.locale],
      title: post.title,
      description: post.excerpt,
      url,
      publishedTime: post.publishedAt.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      authors: [post.author.name],
      tags: post.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
    },
    ...(post.visibility === 'unlisted' ? { robots: { index: false } } : {}),
  };
};
