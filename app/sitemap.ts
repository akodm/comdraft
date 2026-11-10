import type { MetadataRoute } from 'next';
import { LOCALES, localizePath } from '@/lib/i18n/config';
import { getSiteOrigin } from '@/lib/posts/metadata';
import { getEncodedPostPath } from '@/lib/posts/post-path';
import { listPublicPostPaths } from '@/lib/posts/queries';

// 글이 게시되거나 취소될 때마다 달라지므로 빌드 때 굳히지 않고 요청마다 만든다
export const dynamic = 'force-dynamic';

/**
 * 사이트맵: 메인, 전체 피드, 공개 글의 대표 주소
 * - 대표 주소는 게시할 때의 언어 기준이며 slug 는 퍼센트 인코딩 (일부 공개 글은 넣지 않음)
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin();

  if (!origin) return [];

  const pages = LOCALES.flatMap((locale) => [
    { url: `${origin}${localizePath(locale, '/')}` },
    { url: `${origin}${localizePath(locale, '/posts')}` },
  ]);
  const posts = (await listPublicPostPaths()).map((post) => ({
    url: `${origin}${localizePath(post.locale, getEncodedPostPath(post))}`,
    lastModified: post.updatedAt,
  }));

  return [...pages, ...posts];
}
