import { describe, expect, it } from 'vitest';
import {
  createPostSlug,
  getEncodedPostPath,
  getPostPath,
  parsePostPath,
} from '@/lib/posts/post-path';

describe('createPostSlug', () => {
  it('한글 유지, 기호는 -', () => {
    expect(createPostSlug('Sharp 로 이미지 최적화하기!')).toBe(
      'sharp-로-이미지-최적화하기',
    );
  });

  it('연속 기호 정리와 앞뒤 제거', () => {
    expect(createPostSlug('  --Next.js 16 :: proxy.ts--  ')).toBe(
      'next-js-16-proxy-ts',
    );
  });

  it('NFD 제목도 NFC 와 같은 slug', () => {
    expect(createPostSlug('이미지'.normalize('NFD'))).toBe(
      createPostSlug('이미지'),
    );
  });

  it('60자에서 자르고 끝 - 제거', () => {
    const slug = createPostSlug(`${'a'.repeat(59)} b`);
    expect(slug).toBe('a'.repeat(59));
  });

  it('쓸 글자가 없으면 빈 값', () => {
    expect(createPostSlug('🚀 !!! ???')).toBe('');
  });

  it('60 경계가 서로게이트 쌍 사이에 걸려도 코드 포인트 단위로 자른다', () => {
    // U+20000 (CJK 확장 B) 은 UTF-16 두 단위라 60 단위에서 자르면 쌍이 깨진다.
    const slug = createPostSlug(`${'a'.repeat(59)}\u{20000}b`);

    expect(Array.from(slug)).toHaveLength(60);
    expect(slug).toBe(`${'a'.repeat(59)}\u{20000}`);
    expect(() => encodeURIComponent(slug)).not.toThrow();
  });
});

describe('getPostPath', () => {
  it('slug 가 있으면 slug-id, 없으면 id 만', () => {
    expect(getPostPath({ id: 'a1B2c3D4e5', slug: 'sharp' })).toBe(
      '/posts/sharp-a1B2c3D4e5',
    );
    expect(getPostPath({ id: 'a1B2c3D4e5', slug: '' })).toBe(
      '/posts/a1B2c3D4e5',
    );
  });
});

describe('parsePostPath', () => {
  it('마지막 - 기준으로 slug 와 id 를 나눈다', () => {
    expect(parsePostPath('sharp-로-이미지-a1B2c3D4e5')).toEqual({
      id: 'a1B2c3D4e5',
      slug: 'sharp-로-이미지',
    });
    expect(parsePostPath('a1B2c3D4e5')).toEqual({
      id: 'a1B2c3D4e5',
      slug: '',
    });
  });

  it('ID 형식이 아니면 null', () => {
    expect(parsePostPath('sharp-short')).toBeNull();
    expect(parsePostPath('')).toBeNull();
  });
});

describe('getPostPath 와 parsePostPath 왕복', () => {
  it('slug 가 있을 때 파싱하면 원래 값이 나온다', () => {
    const post = { id: 'a1B2c3D4e5', slug: 'sharp-로-이미지' };
    const segment = getPostPath(post).replace('/posts/', '');

    expect(parsePostPath(segment)).toEqual(post);
  });

  it('slug 가 비어 있을 때 파싱하면 원래 값이 나온다', () => {
    const post = { id: 'a1B2c3D4e5', slug: '' };
    const segment = getPostPath(post).replace('/posts/', '');

    expect(parsePostPath(segment)).toEqual(post);
  });
});

describe('getEncodedPostPath', () => {
  it('한글 slug 는 퍼센트 인코딩한다', () => {
    expect(getEncodedPostPath({ id: 'a1B2c3D4e5', slug: '한글' })).toBe(
      '/posts/%ED%95%9C%EA%B8%80-a1B2c3D4e5',
    );
  });

  it('ASCII slug 와 빈 slug 는 그대로', () => {
    expect(getEncodedPostPath({ id: 'a1B2c3D4e5', slug: 'abc-d' })).toBe(
      '/posts/abc-d-a1B2c3D4e5',
    );
    expect(getEncodedPostPath({ id: 'a1B2c3D4e5', slug: '' })).toBe(
      '/posts/a1B2c3D4e5',
    );
  });
});
