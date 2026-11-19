import type { AdminRole } from '@/lib/db/schema/admin';
import { canEnter } from '@/lib/admin/roles';

/**
 * 어드민 로그인 판정 (DB·쿠키를 쓰지 않는 순수 함수)
 * - 동시 요청이 잠금·IP 한도를 건너뛰지 못하도록 서버 액션은 비밀번호 비교 전에
 *   실패 수를 먼저 올려(예약) 두고, 여기서는 예약 결과와 비교 결과로 응답만 정함
 */

// 연속 실패가 이 횟수에 닿으면 잠금
export const MAX_FAILED_ATTEMPTS = 5;
export const LOCK_DURATION_MS = 15 * 60 * 1000;

// IP 단위 실패 제한 (1시간 창에서 실패가 20회를 넘으면 거부)
export const IP_FAILURE_LIMIT = 20;
export const IP_FAILURE_WINDOW_MS = 60 * 60 * 1000;

/**
 * 비밀번호 비교 전 계정 상태
 * - unknown: 없는 계정
 * - locked: 잠금 중이라 실패 수를 올리지 못함 (비밀번호를 확인하지 않음)
 * - reserved: 이번 시도를 실패로 미리 센 계정 (attempts·lockedUntil 은 올린 뒤의 값)
 */
export type LoginReservation =
  | { kind: 'unknown' }
  | { kind: 'locked'; until: Date }
  | {
      kind: 'reserved';
      role: AdminRole;
      attempts: number;
      lockedUntil: Date | null;
      // 임시 비밀번호 해시가 남아 있는지 (있으면 임시 비밀번호로 확인)
      hasTempPassword: boolean;
    };

export type LoginOutcome =
  | { kind: 'locked'; until: Date }
  | { kind: 'failed'; lockUntil: Date | null }
  | { kind: 'denied' }
  | { kind: 'ok'; next: 'console' | 'password' };

// 이번 예약으로 MAX_FAILED_ATTEMPTS 번째 실패가 되면 저장할 잠금 해제 시각
export function lockUntilFrom(now: Date): Date {
  return new Date(now.getTime() + LOCK_DURATION_MS);
}

// 예약(UPDATE)에 걸린 행이 없을 때, 같은 아이디로 다시 읽은 계정이 잠금 중인지로 구분
export function classifyUnreserved(
  account: { lockedUntil: Date | null } | null,
  now: Date,
): LoginReservation {
  if (
    account !== null &&
    account.lockedUntil !== null &&
    account.lockedUntil.getTime() > now.getTime()
  ) {
    return { kind: 'locked', until: account.lockedUntil };
  }

  return { kind: 'unknown' };
}

/**
 * 로그인 결과 판정
 * - 잠금 중이면 비밀번호 결과와 상관없이 locked
 * - 실패면 예약 때 정해진 잠금 시각(있으면)을 그대로 돌려줌
 * - 비밀번호가 맞아도 들어올 수 없는 권한(비밀번호를 정한 guest)이면 denied
 */
export function evaluateLogin(
  reservation: LoginReservation,
  passwordOk: boolean,
): LoginOutcome {
  if (reservation.kind === 'unknown') {
    return { kind: 'failed', lockUntil: null };
  }

  if (reservation.kind === 'locked') {
    return { kind: 'locked', until: reservation.until };
  }

  if (!passwordOk) {
    return {
      kind: 'failed',
      lockUntil:
        reservation.attempts >= MAX_FAILED_ATTEMPTS
          ? reservation.lockedUntil
          : null,
    };
  }

  const next = canEnter(reservation.role, reservation.hasTempPassword);

  return next === 'denied' ? { kind: 'denied' } : { kind: 'ok', next };
}

// 이번 시도를 포함해 센 IP 실패 수가 한도를 넘었는지
export function isIpOverLimit(count: number): boolean {
  return count > IP_FAILURE_LIMIT;
}
