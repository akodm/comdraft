import { describe, expect, it } from 'vitest';
import { isAuthorizedCronRequest } from '@/lib/seo/cron';
import { buildBlogPostingJsonLd, serializeJsonLd } from '@/lib/seo/json-ld';
import { buildRobots } from '@/lib/seo/robots';
import { buildSitemapEntries } from '@/lib/seo/sitemap';
import { buildLocalizedAlternates } from '@/lib/seo/urls';

const ORIGIN = 'https://comdraft.dev';

describe('buildLocalizedAlternates', () => {
  it('언어별 주소와 x-default(언어 없는 루트)를 만든다', () => {
    expect(buildLocalizedAlternates(ORIGIN, '/', 'en')).toEqual({
      canonical: 'https://comdraft.dev/en',
      languages: {
        ko: 'https://comdraft.dev/ko',
        en: 'https://comdraft.dev/en',
        'x-default': 'https://comdraft.dev/',
      },
    });
  });

  it('하위 경로와 쿼리는 모든 언어 주소에 붙고 x-default 에도 붙는다', () => {
    expect(buildLocalizedAlternates(ORIGIN, '/posts', 'ko', '?page=2')).toEqual(
      {
        canonical: 'https://comdraft.dev/ko/posts?page=2',
        languages: {
          ko: 'https://comdraft.dev/ko/posts?page=2',
          en: 'https://comdraft.dev/en/posts?page=2',
          'x-default': 'https://comdraft.dev/posts?page=2',
        },
      },
    );
  });
});

describe('buildSitemapEntries', () => {
  const updatedAt = new Date('2026-11-10T00:00:00Z');
  const entries = buildSitemapEntries(ORIGIN, [
    { id: 'a1B2c3D4e5', slug: '한글 제목', locale: 'en', updatedAt },
  ]);

  it('메인과 목록은 언어마다 한 줄씩, 서로를 hreflang 으로 가리킨다', () => {
    const home = entries.find((e) => e.url === 'https://comdraft.dev/ko');

    expect(home?.alternates?.languages).toEqual({
      ko: 'https://comdraft.dev/ko',
      en: 'https://comdraft.dev/en',
    });
    expect(entries.map((e) => e.url).slice(0, 4)).toEqual([
      'https://comdraft.dev/ko',
      'https://comdraft.dev/en',
      'https://comdraft.dev/ko/posts',
      'https://comdraft.dev/en/posts',
    ]);
  });

  it('게시글은 게시 언어의 인코딩된 대표 주소와 수정 시각', () => {
    expect(entries[4]).toEqual({
      url: `https://comdraft.dev/en/posts/${encodeURIComponent('한글 제목-a1B2c3D4e5')}`,
      lastModified: updatedAt,
      changeFrequency: 'monthly',
    });
  });
});

describe('buildRobots', () => {
  it('비공개 화면과 API 를 막고 사이트맵 주소를 알린다', () => {
    expect(buildRobots(ORIGIN)).toEqual({
      rules: {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/*/dashboard', '/*/onboarding', '/*/sign-in'],
      },
      sitemap: 'https://comdraft.dev/sitemap.xml',
      host: 'https://comdraft.dev',
    });
  });
});

describe('isAuthorizedCronRequest', () => {
  it('Bearer 비밀 값이 같을 때만 허용', () => {
    expect(isAuthorizedCronRequest('Bearer s3cret', 's3cret')).toBe(true);
    expect(isAuthorizedCronRequest('Bearer wrong', 's3cret')).toBe(false);
    expect(isAuthorizedCronRequest(null, 's3cret')).toBe(false);
  });

  it('비밀 값이 설정되지 않았으면 항상 거절', () => {
    expect(isAuthorizedCronRequest('Bearer undefined', undefined)).toBe(false);
    expect(isAuthorizedCronRequest('Bearer ', '')).toBe(false);
  });
});

describe('JSON-LD', () => {
  it('BlogPosting 에 제목·설명·주소·작성자·시각·태그를 담는다', () => {
    expect(
      buildBlogPostingJsonLd({
        url: 'https://comdraft.dev/ko/posts/s-a1B2c3D4e5',
        title: '제목',
        description: '요약',
        image: 'https://comdraft.dev/ko/posts/s-a1B2c3D4e5/opengraph-image',
        publishedAt: new Date('2026-11-01T00:00:00Z'),
        updatedAt: new Date('2026-11-02T00:00:00Z'),
        authorName: '작성자',
        authorUrl: 'https://github.com/akodm',
        tags: ['nextjs', 'react'],
        locale: 'ko',
      }),
    ).toEqual({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: '제목',
      description: '요약',
      url: 'https://comdraft.dev/ko/posts/s-a1B2c3D4e5',
      mainEntityOfPage: 'https://comdraft.dev/ko/posts/s-a1B2c3D4e5',
      image: 'https://comdraft.dev/ko/posts/s-a1B2c3D4e5/opengraph-image',
      datePublished: '2026-11-01T00:00:00.000Z',
      dateModified: '2026-11-02T00:00:00.000Z',
      inLanguage: 'ko',
      keywords: 'nextjs, react',
      author: {
        '@type': 'Person',
        name: '작성자',
        url: 'https://github.com/akodm',
      },
    });
  });

  it('작성자 주소와 태그가 없으면 그 항목을 뺀다', () => {
    const ld = buildBlogPostingJsonLd({
      url: 'u',
      title: 't',
      description: 'd',
      image: 'i',
      publishedAt: new Date(0),
      updatedAt: new Date(0),
      authorName: 'a',
      authorUrl: null,
      tags: [],
      locale: 'en',
    });

    expect(ld.author).toEqual({ '@type': 'Person', name: 'a' });
    expect(ld).not.toHaveProperty('keywords');
  });

  it('script 안에 넣어도 태그가 닫히지 않도록 < 를 이스케이프', () => {
    const text = serializeJsonLd({ headline: '</script><script>alert(1)' });

    expect(text).not.toContain('</script>');
    expect(JSON.parse(text)).toEqual({ headline: '</script><script>alert(1)' });
  });
});
