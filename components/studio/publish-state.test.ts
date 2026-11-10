import { describe, expect, it } from 'vitest';
import {
  getPublishActions,
  resolvePublishState,
} from '@/components/studio/publish-state';

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

describe('resolvePublishState', () => {
  const post = { id: 'a1B2c3D4e5', slug: 's', visibility: 'public' as const };

  it('덮어쓴 값이 없으면 서버 상태 그대로', () => {
    const base = { status: 'draft' as const, post: null };

    expect(resolvePublishState(base, undefined, undefined)).toEqual(base);
  });

  it('게시 상태를 덮어쓰면 그 값을 따름', () => {
    const override = { status: 'published' as const, post };

    expect(
      resolvePublishState({ status: 'draft', post: null }, override, undefined),
    ).toEqual(override);
  });

  it('게시 뒤 자동 저장으로 바뀐 상태가 게시 상태보다 우선', () => {
    const override = { status: 'published' as const, post };

    expect(
      resolvePublishState(
        { status: 'draft', post: null },
        override,
        'temporary',
      ),
    ).toEqual({ status: 'temporary', post });
  });
});
