import type { MetadataRoute } from 'next';

/**
 * robots.txt
 * - 로그인이 필요한 화면(대시보드·스튜디오, 온보딩), 로그인 화면, API 는 수집하지 않음
 */
export const buildRobots = (origin: string): MetadataRoute.Robots => ({
  rules: {
    userAgent: '*',
    allow: '/',
    disallow: ['/api/', '/*/dashboard', '/*/onboarding', '/*/sign-in'],
  },
  sitemap: `${origin}/sitemap.xml`,
  host: origin,
});
