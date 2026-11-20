import { describe, expect, it } from 'vitest';
import { maskAdminKey } from '@/lib/admin/agent-request';

describe('maskAdminKey', () => {
  const KEY = 'k3y_abcdefghijklmn';

  it('주소의 어드민 키를 가린다', () => {
    expect(maskAdminKey(`/ko/admin/${KEY}/users`, KEY)).toBe(
      '/ko/admin/:key/users',
    );
  });

  it('키가 없거나 주소가 없으면 그대로', () => {
    expect(maskAdminKey('/ko/admin/x/users', undefined)).toBe(
      '/ko/admin/x/users',
    );
    expect(maskAdminKey(undefined, KEY)).toBeUndefined();
  });
});
