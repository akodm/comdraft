import { describe, expect, it } from 'vitest';
import { decodeFeedCursor, encodeFeedCursor } from '@/lib/posts/feed-cursor';

const encodeRaw = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

describe('피드 커서', () => {
  it('커서 왕복', () => {
    const cursor = {
      publishedAt: new Date('2026-11-10T01:02:03.456Z'),
      id: 'a1B2c3D4e5',
    };

    expect(decodeFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor);
  });

  it('잘못된 커서는 null', () => {
    expect(decodeFeedCursor('not-base64-json')).toBeNull();
    expect(decodeFeedCursor('')).toBeNull();
    // 시각이 올바르지 않음
    expect(decodeFeedCursor(encodeRaw(['x', 'a1B2c3D4e5']))).toBeNull();
    // ID 형식이 아님
    expect(
      decodeFeedCursor(encodeRaw(['2026-11-10T01:02:03.456Z', 'a'])),
    ).toBeNull();
    // 배열이 아니거나 길이가 다름
    expect(
      decodeFeedCursor(encodeRaw({ publishedAt: 'x', id: 'a1B2c3D4e5' })),
    ).toBeNull();
    expect(
      decodeFeedCursor(
        encodeRaw(['2026-11-10T01:02:03.456Z', 'a1B2c3D4e5', 1]),
      ),
    ).toBeNull();
  });
});
