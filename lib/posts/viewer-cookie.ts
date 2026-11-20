import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { isViewerId } from '@/lib/posts/post-view';

/**
 * 방문자 ID 쿠키 서명 (proxy 와 조회 기록 서버 액션 공용, 둘 다 Node 런타임)
 * - 값: `<uuid>.<서명>`, 서명 = base64url(HMAC-SHA256(키, uuid))
 * - 키는 BETTER_AUTH_SECRET 에서 용도별로 갈라 씀: HMAC(비밀값, 'comdraft-viewer-v1')
 *   → 새 환경 변수 없이, 세션 서명과 같은 키를 그대로 쓰지 않음
 * - 서명이 없거나(예전 쿠키) 틀린 쿠키는 없는 것으로 봄: 조회를 세지 않고 proxy 가 다음 페이지 GET 에 새로 심음
 * - DB(post_view.viewer_key)에는 uuid 부분만 씀
 */
const KEY_CONTEXT = 'comdraft-viewer-v1';
// SHA-256 서명을 base64url 로 쓴 길이 (패딩 없음)
const SIGNATURE_LENGTH = 43;

const deriveKey = (secret: string) =>
  createHmac('sha256', secret).update(KEY_CONTEXT).digest();

const sign = (viewerId: string, secret: string) =>
  createHmac('sha256', deriveKey(secret)).update(viewerId).digest('base64url');

/** uuid 에 서명을 붙인 쿠키 값 (비밀값이 없으면 던짐) */
export const signViewerId = (viewerId: string, secret: string): string => {
  if (!secret) {
    throw new Error('방문자 쿠키 서명에 BETTER_AUTH_SECRET 이 필요합니다.');
  }

  return `${viewerId}.${sign(viewerId, secret)}`;
};

/** 새 방문자 ID 를 만들어 서명한 쿠키 값 */
export const createViewerCookie = (secret: string): string =>
  signViewerId(randomUUID(), secret);

/**
 * 쿠키 값을 검증하고 uuid 를 돌려줌 (형식·서명이 틀리거나 비밀값이 없으면 null)
 * - 서명은 길이를 맞춘 뒤 timingSafeEqual 로 비교
 */
export const verifyViewerCookie = (
  value: string | undefined,
  secret: string | undefined,
): string | null => {
  if (!value || !secret) {
    return null;
  }

  const parts = value.split('.');

  if (parts.length !== 2) {
    return null;
  }

  const [viewerId, signature] = parts;

  if (!isViewerId(viewerId) || signature.length !== SIGNATURE_LENGTH) {
    return null;
  }

  const expected = Buffer.from(sign(viewerId, secret));
  const actual = Buffer.from(signature);

  if (actual.length !== expected.length) {
    return null;
  }

  return timingSafeEqual(actual, expected) ? viewerId : null;
};
