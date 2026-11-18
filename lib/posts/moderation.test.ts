import { describe, expect, it } from 'vitest';
import {
  MAX_BAN_REASON_LENGTH,
  parseModerationRequest,
} from '@/lib/posts/moderation';

const ID = 'aB3dE5gH7j';

describe('parseModerationRequest', () => {
  it('게시글 ID 나 주소(상대·절대, 퍼센트 인코딩)로 대상을 찾는다', () => {
    const targets = [
      ID,
      `slug-${ID}`,
      `/ko/posts/slug-${ID}`,
      `https://comdraft.dev/en/posts/${encodeURIComponent(`한글-제목-${ID}`)}`,
      `https://comdraft.dev/ko/posts/slug-${ID}?ref=x#top`,
    ];

    for (const target of targets) {
      expect(
        parseModerationRequest({ target, action: 'ban', reason: '광고' }),
      ).toEqual({ postId: ID, action: 'ban', reason: '광고' });
    }
  });

  it('조치 해제는 사유 없이도 받는다', () => {
    expect(parseModerationRequest({ target: ID, action: 'unban' })).toEqual({
      postId: ID,
      action: 'unban',
      reason: null,
    });
  });

  it('조치 사유는 앞뒤 공백을 지우고 필수이며 길이를 제한한다', () => {
    expect(
      parseModerationRequest({ target: ID, action: 'ban', reason: '  비방  ' })
        ?.reason,
    ).toBe('비방');
    expect(
      parseModerationRequest({ target: ID, action: 'ban', reason: '  ' }),
    ).toBeNull();
    expect(parseModerationRequest({ target: ID, action: 'ban' })).toBeNull();
    expect(
      parseModerationRequest({
        target: ID,
        action: 'ban',
        reason: 'x'.repeat(MAX_BAN_REASON_LENGTH + 1),
      }),
    ).toBeNull();
  });

  it('형식이 다르면 null', () => {
    const rejected: unknown[] = [
      null,
      'ban',
      { target: ID, action: 'delete', reason: 'x' },
      { target: 'not-an-id', action: 'ban', reason: 'x' },
      {
        target: 'https://comdraft.dev/ko/posts/%E0%A4%A',
        action: 'ban',
        reason: 'x',
      },
      { target: 123, action: 'ban', reason: 'x' },
      { action: 'ban', reason: 'x' },
    ];

    for (const value of rejected) {
      expect(parseModerationRequest(value)).toBeNull();
    }
  });
});
