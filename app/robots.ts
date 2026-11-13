import type { MetadataRoute } from 'next';
import { getSiteOrigin } from '@/lib/posts/metadata';
import { buildRobots } from '@/lib/seo/robots';

/**
 * robots.txt (운영 주소 기준 사이트맵 주소 포함)
 * - 주소 설정이 없으면 전부 허용만 (사이트맵 주소를 만들 수 없음)
 */
export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();

  return origin
    ? buildRobots(origin)
    : { rules: { userAgent: '*', allow: '/' } };
}
