import { timingSafeEqual } from 'node:crypto';

const ADMIN_KEY_PATTERN = /^[A-Za-z0-9_-]{16,}$/;

export type AdminPathDecision = 'not_admin' | 'allow' | 'forbidden';

export function isValidAdminKey(key: string | undefined): key is string {
  return typeof key === 'string' && ADMIN_KEY_PATTERN.test(key);
}

// 길이가 다르면 같은 길이의 더미와 비교해 길이 차이로 인한 시간 편차를 줄임
export function matchesAdminKey(
  candidate: string,
  key: string | undefined,
): boolean {
  if (!isValidAdminKey(key)) {
    return false;
  }

  const expected = Buffer.from(key);
  const actual = Buffer.from(candidate);

  if (actual.length !== expected.length) {
    timingSafeEqual(expected, Buffer.alloc(expected.length));

    return false;
  }

  return timingSafeEqual(actual, expected);
}

/**
 * 로케일을 뗀 경로(splitLocalePath 결과)가 어드민 경로인지, 주소 키가 맞는지 판단
 * - 키 세그먼트는 디코딩 없이 원문 그대로 비교 (퍼센트 인코딩된 키는 거부)
 */
export function getAdminPathDecision(
  path: string,
  key: string | undefined,
): AdminPathDecision {
  const [, first, second = ''] = path.split('/');

  if (first !== 'admin') {
    return 'not_admin';
  }

  return matchesAdminKey(second, key) ? 'allow' : 'forbidden';
}
