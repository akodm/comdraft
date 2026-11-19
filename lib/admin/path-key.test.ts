import { describe, expect, it } from 'vitest';
import {
  adminPath,
  getAdminPathDecision,
  isValidAdminKey,
  matchesAdminKey,
} from '@/lib/admin/path-key';

const KEY = 'k3y_abcdefghijklmn';

describe('getAdminPathDecision', () => {
  it.each([
    ['/posts/admin', 'not_admin'],
    ['/admins', 'not_admin'],
    ['/admin', 'forbidden'],
    ['/admin/', 'forbidden'],
    [`/admin/${KEY}`, 'allow'],
    [`/admin/${KEY}/`, 'allow'],
    [`/admin/${KEY}/users`, 'allow'],
    [`/admin/${KEY.toUpperCase()}`, 'forbidden'],
    ['/admin/k3y%5Fabcdefghijklmn', 'forbidden'],
    ['/admin/wrong-key-0000000', 'forbidden'],
  ])('%s → %s', (path, expected) => {
    expect(getAdminPathDecision(path, KEY)).toBe(expected);
  });

  it('키가 없거나 형식이 틀리면 어드민 경로는 모두 forbidden', () => {
    expect(getAdminPathDecision(`/admin/${KEY}`, undefined)).toBe('forbidden');
    expect(getAdminPathDecision('/admin/short', 'short')).toBe('forbidden');
  });
});

describe('isValidAdminKey / matchesAdminKey', () => {
  it('형식을 검사한다', () => {
    expect(isValidAdminKey(KEY)).toBe(true);
    expect(isValidAdminKey('short')).toBe(false);
    expect(isValidAdminKey('has space 0123456789')).toBe(false);
    expect(isValidAdminKey(undefined)).toBe(false);
  });

  it('후보가 키와 정확히 같을 때만 true', () => {
    expect(matchesAdminKey(KEY, KEY)).toBe(true);
    expect(matchesAdminKey(`${KEY}x`, KEY)).toBe(false);
    expect(matchesAdminKey(KEY, undefined)).toBe(false);
  });
});

describe('adminPath', () => {
  it('로케일·키·하위 경로로 어드민 주소를 만든다 (끝 슬래시 없음)', () => {
    expect(adminPath('ko', KEY)).toBe(`/ko/admin/${KEY}`);
    expect(adminPath('en', KEY, 'login')).toBe(`/en/admin/${KEY}/login`);
    expect(adminPath('ko', KEY, 'account/password')).toBe(
      `/ko/admin/${KEY}/account/password`,
    );
  });
});
