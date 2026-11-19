import { describe, expect, it } from 'vitest';
import { evaluateLogin, isIpBlocked, isLocked } from '@/lib/admin/login';

const now = new Date('2026-11-19T00:00:00Z');
const base = {
  role: 'viewer',
  failedAttempts: 0,
  lockedUntil: null,
  hasTempPassword: false,
} as const;

describe('evaluateLogin', () => {
  it('잠금 중이면 비밀번호와 상관없이 locked', () =>
    expect(
      evaluateLogin(
        { ...base, lockedUntil: new Date('2026-11-19T00:10:00Z') },
        true,
        now,
      ).kind,
    ).toBe('locked'));

  it('잠금 시각이 지났으면 다시 확인', () =>
    expect(
      evaluateLogin(
        { ...base, lockedUntil: new Date('2026-11-18T23:59:59Z') },
        true,
        now,
      ),
    ).toEqual({ kind: 'ok', next: 'console' }));

  it('다섯 번째 실패에 15분 잠금', () =>
    expect(evaluateLogin({ ...base, failedAttempts: 4 }, false, now)).toEqual({
      kind: 'failed',
      lockUntil: new Date('2026-11-19T00:15:00Z'),
    }));

  it('네 번째 실패까지는 잠그지 않음', () =>
    expect(evaluateLogin({ ...base, failedAttempts: 3 }, false, now)).toEqual({
      kind: 'failed',
      lockUntil: null,
    }));

  it('없는 계정은 failed 이고 잠금 없음', () =>
    expect(evaluateLogin(null, false, now)).toEqual({
      kind: 'failed',
      lockUntil: null,
    }));

  it('비밀번호를 정한 guest 는 성공해도 denied', () =>
    expect(evaluateLogin({ ...base, role: 'guest' }, true, now).kind).toBe(
      'denied',
    ));

  it('임시 비밀번호 로그인은 변경 화면으로', () =>
    expect(
      evaluateLogin(
        { ...base, role: 'guest', hasTempPassword: true },
        true,
        now,
      ),
    ).toEqual({ kind: 'ok', next: 'password' }));
});

describe('isLocked', () => {
  it('잠금 해제 시각 전이면 true, 같거나 지나면 false', () => {
    expect(
      isLocked({ lockedUntil: new Date('2026-11-19T00:00:01Z') }, now),
    ).toBe(true);
    expect(isLocked({ lockedUntil: now }, now)).toBe(false);
    expect(isLocked({ lockedUntil: null }, now)).toBe(false);
    expect(isLocked(null, now)).toBe(false);
  });
});

describe('IP 실패 제한', () => {
  const nowMs = now.getTime();
  const hour = 60 * 60 * 1000;

  it('1시간 안에 실패가 20회를 넘으면 막음', () => {
    expect(isIpBlocked({ count: 21, lastRequest: nowMs - 1000 }, nowMs)).toBe(
      true,
    );
    expect(isIpBlocked({ count: 20, lastRequest: nowMs - 1000 }, nowMs)).toBe(
      false,
    );
    expect(isIpBlocked(null, nowMs)).toBe(false);
  });

  it('마지막 실패가 1시간보다 오래되면 막지 않음', () =>
    expect(
      isIpBlocked({ count: 50, lastRequest: nowMs - hour - 1 }, nowMs),
    ).toBe(false));
});
