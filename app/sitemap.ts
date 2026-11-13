import type { MetadataRoute } from 'next';
import { getSiteOrigin } from '@/lib/posts/metadata';
import { listPublicPostPaths } from '@/lib/posts/queries';
import { buildSitemapEntries } from '@/lib/seo/sitemap';

// 캐시해 둔 사이트맵을 일주일마다 다시 만듦 (안전망)
// - 공개 글 목록이 바뀌면 lib/seo/revalidate-sitemap 이 바로 다시 만들게 하고,
//   일요일 0시(한국 시간) Vercel Cron(/api/cron/sitemap)도 한 번 더 다시 만듦
export const revalidate = 604800;

/**
 * 사이트맵: 언어별 메인·게시글 목록, 공개 글의 대표 주소 (일부 공개 글은 넣지 않음)
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = getSiteOrigin();

  if (!origin) return [];

  return buildSitemapEntries(origin, await listPublicPostPaths());
}
