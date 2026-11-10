import { describe, expect, it } from 'vitest';
import {
  createPostSlug,
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
