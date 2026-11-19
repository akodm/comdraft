import { describe, expect, it } from 'vitest';
import {
  classifyUnreserved,
  evaluateLogin,
  IP_FAILURE_LIMIT,
  isIpOverLimit,
  lockUntilFrom,
  type LoginReservation,
} from '@/lib/admin/login';

const now = new Date('2026-11-19T00:00:00Z');
const lockedUntil = new Date('2026-11-19T00:10:00Z');

// 실패 수를 먼저 올린(예약한) 계정
const reserved = (
  overrides: Partial<Extract<LoginReservation, { kind: 'reserved' }>> = {},
): LoginReservation => ({
  kind: 'reserved',
  role: 'viewer',
  attempts: 1,
  lockedUntil: null,
  hasTempPassword: false,
  ...overrides,
});

describe('lockUntilFrom', () => {
  it('지금부터 15분 뒤', () =>
    expect(lockUntilFrom(now)).toEqual(new Date('2026-11-19T00:15:00Z')));
});

describe('classifyUnreserved', () => {
  it('잠금 중인 계정이라 예약되지 않았으면 locked', () =>
    expect(classifyUnreserved({ lockedUntil }, now)).toEqual({
      kind: 'locked',
      until: lockedUntil,
    }));

  it('없는 계정은 unknown', () =>
    expect(classifyUnreserved(null, now)).toEqual({ kind: 'unknown' }));

  it('잠금이 이미 풀린 계정(예약과 조회 사이에 풀림)은 unknown 으로 일반 실패', () => {
    expect(classifyUnreserved({ lockedUntil: now }, now)).toEqual({
      kind: 'unknown',
    });
    expect(classifyUnreserved({ lockedUntil: null }, now)).toEqual({
      kind: 'unknown',
    });
  });
});

describe('evaluateLogin', () => {
  it('잠금 중이면 비밀번호와 상관없이 locked', () =>
    expect(evaluateLogin({ kind: 'locked', until: lockedUntil }, true)).toEqual(
      { kind: 'locked', until: lockedUntil },
    ));

  it('다섯 번째 실패는 예약 때 정해진 15분 잠금을 돌려줌', () => {
    const lockUntil = lockUntilFrom(now);
    expect(
      evaluateLogin(reserved({ attempts: 5, lockedUntil: lockUntil }), false),
    ).toEqual({ kind: 'failed', lockUntil });
  });

  it('네 번째 실패까지는 잠그지 않음', () =>
    expect(evaluateLogin(reserved({ attempts: 4 }), false)).toEqual({
      kind: 'failed',
      lockUntil: null,
    }));

  it('다섯 번째 시도라도 비밀번호가 맞으면 들어감 (성공 처리에서 잠금을 풂)', () =>
    expect(
      evaluateLogin(
        reserved({ attempts: 5, lockedUntil: lockUntilFrom(now) }),
        true,
      ),
    ).toEqual({ kind: 'ok', next: 'console' }));

  it('없는 계정은 failed 이고 잠금 없음', () =>
    expect(evaluateLogin({ kind: 'unknown' }, false)).toEqual({
      kind: 'failed',
      lockUntil: null,
    }));

  it('비밀번호를 정한 guest 는 성공해도 denied', () =>
    expect(evaluateLogin(reserved({ role: 'guest' }), true).kind).toBe(
      'denied',
    ));

  it('임시 비밀번호 로그인은 변경 화면으로', () =>
    expect(
      evaluateLogin(reserved({ role: 'guest', hasTempPassword: true }), true),
    ).toEqual({ kind: 'ok', next: 'password' }));
});

describe('isIpOverLimit', () => {
  it('이번 시도를 포함한 1시간 실패 수가 20회를 넘으면 막음', () => {
    expect(isIpOverLimit(IP_FAILURE_LIMIT)).toBe(false);
    expect(isIpOverLimit(IP_FAILURE_LIMIT + 1)).toBe(true);
    expect(isIpOverLimit(1)).toBe(false);
  });
});
