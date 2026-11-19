import type { AdminRole } from '@/lib/db/schema/admin';
import { canEnter } from '@/lib/admin/roles';

/**
 * 어드민 로그인 판정 (DB·쿠키를 쓰지 않는 순수 함수)
 * - 계정 조회, 비밀번호 비교, 실패 수 저장은 서버 액션이 하고 여기서는 결과만 정함
 */

// 연속 실패가 이 횟수에 닿으면 잠금
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

// IP 단위 실패 제한 (1시간 창에서 실패가 20회를 넘으면 거부)
export const IP_FAILURE_LIMIT = 20;
export const IP_FAILURE_WINDOW_MS = 60 * 60 * 1000;

export interface LoginAccount {
  role: AdminRole;
  failedAttempts: number;
  lockedUntil: Date | null;
  // 임시 비밀번호 해시가 남아 있는지 (있으면 임시 비밀번호로 확인)
  hasTempPassword: boolean;
}

export type LoginOutcome =
  | { kind: 'locked'; until: Date }
  | { kind: 'failed'; lockUntil: Date | null }
  | { kind: 'denied' }
  | { kind: 'ok'; next: 'console' | 'password' };

export function isLocked(
  account: Pick<LoginAccount, 'lockedUntil'> | null,
  now: Date,
): boolean {
  return (
    account !== null &&
    account.lockedUntil !== null &&
    account.lockedUntil.getTime() > now.getTime()
  );
}

/**
 * 로그인 결과 판정
 * - 잠금 중이면 비밀번호 결과와 상관없이 locked (액션도 잠금 중에는 실제 해시와 비교하지 않음)
 * - 실패가 MAX_FAILED_ATTEMPTS 번째 이상이면 지금부터 15분 잠금
 * - 비밀번호가 맞아도 들어올 수 없는 권한(비밀번호를 정한 guest)이면 denied
 */
export function evaluateLogin(
  account: LoginAccount | null,
  passwordOk: boolean,
  now: Date,
): LoginOutcome {
  if (account === null) {
    return { kind: 'failed', lockUntil: null };
  }

  if (isLocked(account, now)) {
    return { kind: 'locked', until: account.lockedUntil as Date };
  }

  if (!passwordOk) {
    const attempts = account.failedAttempts + 1;

    return {
      kind: 'failed',
      lockUntil:
        attempts >= MAX_FAILED_ATTEMPTS
          ? new Date(now.getTime() + LOCK_DURATION_MS)
          : null,
    };
  }

  const next = canEnter(account.role, account.hasTempPassword);

  return next === 'denied' ? { kind: 'denied' } : { kind: 'ok', next };
}

// rate_limit 행 기준으로 이 IP 의 로그인 시도를 막을지 (lastRequest 는 마지막 실패 시각, ms)
export function isIpBlocked(
  row: { count: number; lastRequest: number } | null,
  nowMs: number,
): boolean {
  if (row === null || nowMs - row.lastRequest > IP_FAILURE_WINDOW_MS) {
    return false;
  }

  return row.count > IP_FAILURE_LIMIT;
}
