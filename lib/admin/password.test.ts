import { describe, expect, it } from 'vitest';
import { hashPassword, validateNewPassword, verifyPassword } from './password';

// pgcrypto 로 만든 $2a$ bcrypt 해시 (테스트 전용 값 'temp-pass-1234')
const PGCRYPTO_HASH = '$2a$12$66/cXHz.JDpGnWdSwwXFD.50cP9.yV.fTwBT1WsVdS.stDIHOCnJC';

describe('verifyPassword', () => {
  it('pgcrypto 가 만든 bcrypt 해시를 확인함', async () => {
    expect(await verifyPassword('temp-pass-1234', PGCRYPTO_HASH)).toBe(true);
    expect(await verifyPassword('wrong', PGCRYPTO_HASH)).toBe(false);
  });
  it('해시가 없으면 false', async () => expect(await verifyPassword('x', null)).toBe(false));
  it('hashPassword 결과를 verifyPassword 가 확인함', async () => {
    const hash = await hashPassword('a-long-password-1');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verifyPassword('a-long-password-1', hash)).toBe(true);
  });
});

describe('validateNewPassword', () => {
  it('새 비밀번호 검사', () => {
    expect(validateNewPassword('jayden', 'short', 'short')).toBe('too_short');
    expect(validateNewPassword('jayden-admin', 'jayden-admin', 'jayden-admin')).toBe('same_as_login');
    expect(validateNewPassword('jayden', 'a-long-password-1', 'a-long-password-2')).toBe('mismatch');
    expect(validateNewPassword('jayden', 'a-long-password-1', 'a-long-password-1')).toBe('ok');
  });
});
