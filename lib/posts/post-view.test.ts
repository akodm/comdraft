import { describe, expect, it } from 'vitest';
import {
  getViewerKey,
  isPostDetailPath,
  isViewerId,
} from '@/lib/posts/post-view';

const VALID = '0b7c2f4e-9a1d-4c3b-8e5f-6a7b8c9d0e1f';

describe('getViewerKey', () => {
  it('글쓴이 본인이면 null', () => {
    expect(
      getViewerKey({ sessionUserId: 'u1', viewerId: VALID, authorId: 'u1' }),
    ).toBeNull();
  });

  it('로그인 사용자는 계정 기준 (쿠키보다 우선)', () => {
    expect(
      getViewerKey({ sessionUserId: 'u1', viewerId: VALID, authorId: 'u2' }),
    ).toBe('user:u1');
    expect(
      getViewerKey({
        sessionUserId: 'u1',
        viewerId: undefined,
        authorId: 'u2',
      }),
    ).toBe('user:u1');
  });

  it('비로그인은 유효한 쿠키가 있을 때만 익명 기준', () => {
    expect(
      getViewerKey({ sessionUserId: null, viewerId: VALID, authorId: 'u2' }),
    ).toBe(`anon:${VALID}`);
    expect(
      getViewerKey({
        sessionUserId: null,
        viewerId: undefined,
        authorId: 'u2',
      }),
    ).toBeNull();
    expect(
      getViewerKey({ sessionUserId: null, viewerId: 'abc', authorId: 'u2' }),
    ).toBeNull();
  });
});

describe('isViewerId', () => {
  it('UUID 형식만 허용', () => {
    expect(isViewerId(VALID)).toBe(true);
    expect(isViewerId(VALID.toUpperCase())).toBe(true);
    expect(isViewerId('x')).toBe(false);
    expect(isViewerId('')).toBe(false);
    expect(isViewerId(undefined)).toBe(false);
    expect(isViewerId(`${VALID}0`)).toBe(false);
  });
});

describe('isPostDetailPath', () => {
  it('게시글 상세 경로만 true', () => {
    expect(isPostDetailPath('/posts/abc-1234567890')).toBe(true);
    expect(isPostDetailPath('/posts/1234567890')).toBe(true);
  });

  it('목록, 하위 경로, 다른 화면은 false', () => {
    for (const path of ['/posts', '/posts/', '/posts/a/b', '/dashboard', '/']) {
      expect(isPostDetailPath(path)).toBe(false);
    }
  });
});
