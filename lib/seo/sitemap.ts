import type { MetadataRoute } from 'next';
import { LOCALES, localizePath, type Locale } from '@/lib/i18n/config';
import { getEncodedPostPath } from '@/lib/posts/post-path';

// 사이트맵에 언어별로 넣는 고정 페이지 (메인, 게시글 목록, 개인정보처리방침, 이용약관)
const LOCALIZED_PAGES = ['/', '/posts', '/privacy', '/terms'] as const;

export interface SitemapPost {
  id: string;
  slug: string;
  locale: Locale;
  updatedAt: Date;
}

/**
 * 사이트맵 항목
 * - 메인·목록: 언어마다 한 줄씩, 서로를 hreflang 으로 가리킴
 * - 공개 글: 게시할 때의 언어 대표 주소(slug 퍼센트 인코딩), 다시 게시하면 바뀌는 수정 시각
 */
export const buildSitemapEntries = (
  origin: string,
  posts: SitemapPost[],
): MetadataRoute.Sitemap => {
  const pages = LOCALIZED_PAGES.flatMap((path) => {
    const languages = Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        `${origin}${localizePath(locale, path)}`,
      ]),
    );

    return LOCALES.map((locale) => ({
      url: languages[locale],
      alternates: { languages },
    }));
  });

  const postEntries = posts.map((post) => ({
    url: `${origin}${localizePath(post.locale, getEncodedPostPath(post))}`,
    lastModified: post.updatedAt,
    changeFrequency: 'monthly' as const,
  }));

  return [...pages, ...postEntries];
};
