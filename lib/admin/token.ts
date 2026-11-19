import { createHash, randomBytes } from 'node:crypto';

// 세션 토큰은 쿠키에만 두고 DB 에는 SHA-256 해시만 저장
export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSessionToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSessionToken(token) };
}
