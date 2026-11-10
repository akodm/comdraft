import { describe, expect, it } from 'vitest';
import { createPostId, isPostId } from '@/lib/posts/post-id';

describe('createPostId', () => {
  it('10자 영숫자', () => {
    for (let i = 0; i < 200; i++) {
      expect(createPostId()).toMatch(/^[0-9A-Za-z]{10}$/);
    }
  });
});

describe('isPostId', () => {
  it('10자 영숫자만 통과', () => {
    expect(isPostId('a1B2c3D4e5')).toBe(true);
    expect(isPostId('a1B2c3D4e')).toBe(false);
    expect(isPostId('a1B2c3D4e-')).toBe(false);
  });
});
