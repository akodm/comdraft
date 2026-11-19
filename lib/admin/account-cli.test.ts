import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/admin/password';
import { ADMIN_ROLES } from '@/lib/db/schema/admin';
import {
  CLI_ADMIN_ROLES,
  checkRoleChange,
  generateTempPassword,
  parseAdminCreateArgs,
  parseAdminRoleArgs,
} from '@/lib/admin/account-cli';

describe('parseAdminCreateArgs', () => {
  it('유효한 아이디를 받는다', () => {
    expect(parseAdminCreateArgs(['jayden.cho_1-a'])).toEqual({
      loginId: 'jayden.cho_1-a',
      reset: false,
    });
  });

  it('--reset 은 앞뒤 어디에 있어도 된다', () => {
    expect(parseAdminCreateArgs(['abc', '--reset'])).toEqual({
      loginId: 'abc',
      reset: true,
    });
    expect(parseAdminCreateArgs(['--reset', 'abc'])).toEqual({
      loginId: 'abc',
      reset: true,
    });
  });

  it('아이디가 없으면 usage', () => {
    expect(parseAdminCreateArgs([])).toEqual({ error: 'usage' });
    expect(parseAdminCreateArgs(['--reset'])).toEqual({ error: 'usage' });
  });

  it('알 수 없는 플래그나 인자가 많으면 usage', () => {
    expect(parseAdminCreateArgs(['abc', '--force'])).toEqual({
      error: 'usage',
    });
    expect(parseAdminCreateArgs(['abc', 'def'])).toEqual({ error: 'usage' });
  });

  it('너무 짧거나 길거나 허용되지 않는 문자는 invalid_login_id', () => {
    expect(parseAdminCreateArgs(['ab'])).toEqual({
      error: 'invalid_login_id',
    });
    expect(parseAdminCreateArgs(['a'.repeat(65)])).toEqual({
      error: 'invalid_login_id',
    });
    expect(parseAdminCreateArgs(['a b c'])).toEqual({
      error: 'invalid_login_id',
    });
    expect(parseAdminCreateArgs(["a'; drop"])).toEqual({
      error: 'invalid_login_id',
    });
    expect(parseAdminCreateArgs(['한글아이디'])).toEqual({
      error: 'invalid_login_id',
    });
  });

  it('경계 길이 3, 64 는 허용', () => {
    expect(parseAdminCreateArgs(['abc'])).toEqual({
      loginId: 'abc',
      reset: false,
    });
    expect(parseAdminCreateArgs(['a'.repeat(64)])).toMatchObject({
      reset: false,
    });
  });
});

describe('generateTempPassword', () => {
  it('24자 base64url 문자만 쓴다', () => {
    expect(generateTempPassword()).toMatch(/^[A-Za-z0-9_-]{24}$/);
  });

  it('호출마다 다르다', () => {
    expect(generateTempPassword()).not.toBe(generateTempPassword());
  });

  it('hashPassword 결과를 verifyPassword 로 검증할 수 있다', async () => {
    const password = generateTempPassword();
    const hash = await hashPassword(password);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword(`${password}x`, hash)).toBe(false);
  });
});

describe('parseAdminRoleArgs', () => {
  it('아이디와 권한을 받는다', () => {
    expect(parseAdminRoleArgs(['jayden', 'admin'])).toEqual({
      loginId: 'jayden',
      role: 'admin',
    });
    expect(parseAdminRoleArgs(['jayden', 'guest'])).toEqual({
      loginId: 'jayden',
      role: 'guest',
    });
  });

  it('인자 수가 다르거나 플래그가 섞이면 usage', () => {
    expect(parseAdminRoleArgs([])).toEqual({ error: 'usage' });
    expect(parseAdminRoleArgs(['jayden'])).toEqual({ error: 'usage' });
    expect(parseAdminRoleArgs(['jayden', 'admin', 'extra'])).toEqual({
      error: 'usage',
    });
    expect(parseAdminRoleArgs(['--force', 'admin'])).toEqual({
      error: 'usage',
    });
  });

  it('아이디 형식이 틀리면 invalid_login_id', () => {
    expect(parseAdminRoleArgs(['ab', 'admin'])).toEqual({
      error: 'invalid_login_id',
    });
  });

  it('모르는 권한은 invalid_role', () => {
    expect(parseAdminRoleArgs(['jayden', 'owner'])).toEqual({
      error: 'invalid_role',
    });
    expect(parseAdminRoleArgs(['jayden', 'ADMIN'])).toEqual({
      error: 'invalid_role',
    });
  });
});

describe('checkRoleChange', () => {
  it('비밀번호를 정하기 전에는 guest 외 권한으로 올릴 수 없다', () => {
    expect(checkRoleChange({ hasPassword: false }, 'admin')).toBe(
      'password_not_set',
    );
    expect(checkRoleChange({ hasPassword: false }, 'guest')).toBe('ok');
  });

  it('비밀번호를 정한 뒤에는 어느 권한으로든 바꿀 수 있다', () => {
    expect(checkRoleChange({ hasPassword: true }, 'editor')).toBe('ok');
    expect(checkRoleChange({ hasPassword: true }, 'guest')).toBe('ok');
  });
});

describe('CLI_ADMIN_ROLES', () => {
  it('스키마의 ADMIN_ROLES 와 같다', () => {
    expect([...CLI_ADMIN_ROLES]).toEqual([...ADMIN_ROLES]);
  });
});
