// 전체 피드 커서 인코딩. 서버/클라이언트 어디서든 테스트할 수 있도록 server-only, DB, Lingui 를 import 하지 않는다.

import { isPostId } from '@/lib/posts/post-id';

// 피드에서 한 번에 불러오는 게시글 수
export const POST_FEED_PAGE_SIZE = 20;

export interface PostFeedCursor {
  publishedAt: Date;
  id: string;
}

/** 마지막 항목의 (게시 시각, ID) 를 불투명한 문자열로 만든다. */
export function encodeFeedCursor({ publishedAt, id }: PostFeedCursor): string {
  return Buffer.from(JSON.stringify([publishedAt.toISOString(), id])).toString(
    'base64url',
  );
}

/**
 * 클라이언트가 보낸 커서를 풀어낸다.
 * 위조할 수 있으므로 형식을 확인하고, 시각이 올바르지 않거나 ID 형식이 아니면 null 이다.
 */
export function decodeFeedCursor(value: string): PostFeedCursor | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, 'base64url').toString('utf8'),
    );

    if (
      !Array.isArray(parsed) ||
      parsed.length !== 2 ||
      typeof parsed[0] !== 'string' ||
      typeof parsed[1] !== 'string' ||
      !isPostId(parsed[1])
    ) {
      return null;
    }

    const publishedAt = new Date(parsed[0]);

    return Number.isNaN(publishedAt.getTime())
      ? null
      : { publishedAt, id: parsed[1] };
  } catch {
    return null;
  }
}
