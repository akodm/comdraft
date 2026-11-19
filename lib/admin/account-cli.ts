import { randomBytes } from 'node:crypto';

// 어드민 계정 스크립트(scripts/admin-create.mjs)용 순수 함수
// Node 가 .ts 를 직접 읽으므로 이 파일은 별칭(@/) 없이 타입 구문만 사용

const LOGIN_ID_PATTERN = /^[A-Za-z0-9._-]{3,64}$/;
const RESET_FLAG = '--reset';

export type AdminCreateArgs =
  | { loginId: string; reset: boolean }
  | { error: 'usage' | 'invalid_login_id' };

// 인자 해석: <아이디> 하나와 선택 플래그 --reset (순서 무관)
export function parseAdminCreateArgs(argv: string[]): AdminCreateArgs {
  const reset = argv.includes(RESET_FLAG);
  const rest = argv.filter((arg) => arg !== RESET_FLAG);

  if (rest.length !== 1 || rest[0].startsWith('-')) {
    return { error: 'usage' };
  }
  if (!LOGIN_ID_PATTERN.test(rest[0])) {
    return { error: 'invalid_login_id' };
  }
  return { loginId: rest[0], reset };
}

// 임시 비밀번호: 무작위 18바이트 -> base64url 24자
export function generateTempPassword(): string {
  return randomBytes(18).toString('base64url');
}
