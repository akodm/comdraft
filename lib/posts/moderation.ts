import { parsePostPath } from '@/lib/posts/post-path';

/**
 * 게시글 임시 조치 요청 (검수 루틴 → POST /api/moderation/posts)
 * - 라우트의 요청 본문 검증용 순수 함수
 * - 대상은 게시글 ID 나 게시글 주소(상대·절대, 퍼센트 인코딩) 어느 쪽이든 받음
 */

export const MODERATION_ACTIONS = ['ban', 'unban'] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

// 조치 사유 최대 길이 (내부 기록용, 화면에 보이지 않음)
export const MAX_BAN_REASON_LENGTH = 500;

export interface ModerationRequest {
  postId: string;
  action: ModerationAction;
  // 조치 사유 (해제는 null)
  reason: string | null;
}

const isAction = (value: unknown): value is ModerationAction =>
  MODERATION_ACTIONS.some((action) => action === value);

// 주소나 ID 에서 게시글 ID 를 꺼냄 (마지막 경로 조각 기준, 디코드 실패나 형식 오류면 null)
const toPostId = (target: string): string | null => {
  const path = target.replace(/^https?:\/\/[^/]+/i, '').replace(/[?#].*$/, '');
  const segment = path.split('/').filter(Boolean).pop();

  if (!segment) {
    return null;
  }

  try {
    return parsePostPath(decodeURIComponent(segment))?.id ?? null;
  } catch {
    return null;
  }
};

/**
 * 요청 본문 → 조치 요청 (형식이 다르면 null)
 * - ban 은 사유가 필수 (앞뒤 공백 제거 후 1~500자), unban 은 사유를 무시
 */
export const parseModerationRequest = (
  value: unknown,
): ModerationRequest | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  const { target, action, reason } = value as Record<string, unknown>;

  if (typeof target !== 'string' || !isAction(action)) {
    return null;
  }

  const postId = toPostId(target.trim());

  if (!postId) {
    return null;
  }

  if (action === 'unban') {
    return { postId, action, reason: null };
  }

  const trimmed = typeof reason === 'string' ? reason.trim() : '';

  if (!trimmed || trimmed.length > MAX_BAN_REASON_LENGTH) {
    return null;
  }

  return { postId, action, reason: trimmed };
};
