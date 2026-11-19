import { describe, expect, it } from 'vitest';
import { createSessionToken, hashSessionToken } from '@/lib/admin/token';

describe('세션 토큰', () => {
  it('토큰의 해시가 hashSessionToken 과 같음', () => {
    const { token, tokenHash } = createSessionToken();
    expect(hashSessionToken(token)).toBe(tokenHash);
    expect(token).not.toBe(tokenHash);
  });
  it('32바이트 base64url 토큰과 sha256 hex 해시', () => {
    const { token, tokenHash } = createSessionToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it('매번 다른 토큰', () => {
    expect(createSessionToken().token).not.toBe(createSessionToken().token);
  });
});
