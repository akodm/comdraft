import bcrypt from 'bcryptjs';

const BCRYPT_COST = 12;
const MIN_PASSWORD_LENGTH = 12;

// 계정이 없거나 해시가 없을 때도 같은 비용으로 비교해 응답 시간 차이를 줄임
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', BCRYPT_COST);

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string | null,
): Promise<boolean> {
  if (hash === null) {
    await bcrypt.compare(plain, DUMMY_HASH);
    return false;
  }
  return bcrypt.compare(plain, hash);
}

export function validateNewPassword(
  loginId: string,
  password: string,
  confirm: string,
): 'ok' | 'too_short' | 'same_as_login' | 'mismatch' {
  if (password.length < MIN_PASSWORD_LENGTH) return 'too_short';
  if (password === loginId) return 'same_as_login';
  if (password !== confirm) return 'mismatch';
  return 'ok';
}
