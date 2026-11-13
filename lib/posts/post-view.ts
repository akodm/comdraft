// 게시글 조회 수 집계 규칙. proxy(Edge)와 서버 액션 양쪽에서 쓰므로 server-only, DB, Lingui 를 import 하지 않는다.

// 같은 사람의 같은 글 조회는 이 기간에 한 번만 셈
export const POST_VIEW_WINDOW_DAYS = 30;

// 비로그인 방문자를 구분하는 무작위 ID 쿠키 (proxy 가 게시글 상세 요청에 넣음)
export const VIEWER_COOKIE = 'comdraft-viewer';
export const VIEWER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const VIEWER_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 방문자 쿠키 값이 UUID 형식인지 확인한다. */
export const isViewerId = (value: string | undefined): value is string =>
  value !== undefined && VIEWER_ID_PATTERN.test(value);

/**
 * 조회를 셀 사람의 키. 셀 수 없으면 null
 * - 글쓴이 본인 → null
 * - 로그인 → `user:{id}`, 비로그인 → 유효한 쿠키가 있을 때만 `anon:{uuid}`
 */
export const getViewerKey = ({
  sessionUserId,
  viewerId,
  authorId,
}: {
  sessionUserId: string | null;
  viewerId: string | undefined;
  authorId: string;
}): string | null => {
  if (sessionUserId === authorId) return null;
  if (sessionUserId) return `user:${sessionUserId}`;

  return isViewerId(viewerId) ? `anon:${viewerId}` : null;
};

/** 로케일을 뗀 경로가 게시글 상세(`/posts/{세그먼트}`)인지 확인한다. */
export const isPostDetailPath = (path: string): boolean =>
  /^\/posts\/[^/]+$/.test(path);
