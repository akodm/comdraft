import { describe, expect, it } from 'vitest';
import { buildPostMetadata } from '@/lib/posts/metadata';
import type { PublishedPost } from '@/lib/posts/queries';

const post = (overrides: Partial<PublishedPost> = {}): PublishedPost => ({
  id: 'a1B2c3D4e5',
  slug: 'slug',
  title: '제목',
  excerpt: '요약',
  content: { type: 'doc', content: [] },
  visibility: 'public',
  locale: 'ko',
  publishedAt: new Date('2026-11-01T00:00:00Z'),
  updatedAt: new Date('2026-11-02T00:00:00Z'),
  author: { name: '작성자', image: null, githubLogin: null },
  tags: [],
  ...overrides,
});

describe('buildPostMetadata', () => {
  it('공개 글은 대표 주소와 article', () => {
    const meta = buildPostMetadata(
      post({ visibility: 'public', locale: 'en', slug: 's', id: 'a1B2c3D4e5' }),
      'https://comdraft.vercel.app',
    );

    expect(meta.alternates?.canonical).toBe(
      'https://comdraft.vercel.app/en/posts/s-a1B2c3D4e5',
    );
    expect(meta.openGraph).toMatchObject({
      type: 'article',
      siteName: 'comdraft',
      locale: 'en_US',
    });
    expect(meta.robots).toBeUndefined();
  });

  it('기술 태그는 키워드와 article:tag 로, 큰 이미지 트위터 카드', () => {
    const meta = buildPostMetadata(
      post({ tags: ['nextjs', 'react'] }),
      'https://x',
    );

    expect(meta.keywords).toEqual(['nextjs', 'react']);
    expect(meta.openGraph).toMatchObject({ tags: ['nextjs', 'react'] });
    expect(meta.twitter).toMatchObject({ card: 'summary_large_image' });
  });

  it('태그가 없으면 키워드를 넣지 않는다', () => {
    expect(buildPostMetadata(post(), 'https://x').keywords).toBeUndefined();
  });

  it('일부 공개는 noindex', () => {
    expect(
      buildPostMetadata(post({ visibility: 'unlisted' }), 'https://x').robots,
    ).toEqual({ index: false });
  });

  it('origin 끝의 슬래시는 제거한다', () => {
    const meta = buildPostMetadata(post(), 'https://x/');

    expect(meta.alternates?.canonical).toBe(
      'https://x/ko/posts/slug-a1B2c3D4e5',
    );
  });

  it('한글 slug 는 대표 주소에서 인코딩한다', () => {
    const meta = buildPostMetadata(post({ slug: '한글' }), 'https://x');

    expect(meta.alternates?.canonical).toBe(
      'https://x/ko/posts/%ED%95%9C%EA%B8%80-a1B2c3D4e5',
    );
  });
});
