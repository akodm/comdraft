import { describe, expect, it } from 'vitest';
import { getPublishActions } from '@/components/studio/publish-state';

describe('getPublishActions', () => {
  it('게시 전에는 게시하기만', () => {
    expect(getPublishActions({ status: 'draft', post: null })).toEqual({
      primary: 'publish',
      canView: false,
      canUnpublish: false,
    });
  });

  it('게시·임시는 다시 게시, 글 보기, 게시 취소', () => {
    const post = { id: 'a1B2c3D4e5', slug: 's', visibility: 'public' as const };

    for (const status of ['published', 'temporary'] as const) {
      expect(getPublishActions({ status, post })).toEqual({
        primary: 'republish',
        canView: true,
        canUnpublish: true,
      });
    }
  });
});
