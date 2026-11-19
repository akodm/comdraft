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

// 권한 이름 (lib/db/schema/admin.ts 의 ADMIN_ROLES 와 같은 순서, 별칭을 못 쓰므로 여기 따로 둠 — 테스트가 일치를 확인)
export const CLI_ADMIN_ROLES = ['guest', 'viewer', 'editor', 'admin'] as const;
export type CliAdminRole = (typeof CLI_ADMIN_ROLES)[number];

export type AdminRoleArgs =
  | { loginId: string; role: CliAdminRole }
  | { error: 'usage' | 'invalid_login_id' | 'invalid_role' };

const isCliAdminRole = (value: string): value is CliAdminRole =>
  (CLI_ADMIN_ROLES as readonly string[]).includes(value);

// 인자 해석: <아이디> <권한> 두 개만
export function parseAdminRoleArgs(argv: string[]): AdminRoleArgs {
  if (argv.length !== 2 || argv.some((arg) => arg.startsWith('-'))) {
    return { error: 'usage' };
  }
  const [loginId, role] = argv;

  if (!LOGIN_ID_PATTERN.test(loginId)) {
    return { error: 'invalid_login_id' };
  }
  if (!isCliAdminRole(role)) {
    return { error: 'invalid_role' };
  }
  return { loginId, role };
}

// 본인 비밀번호를 정하기 전에는 guest 로만 둘 수 있음 (첫 비밀번호 변경 때 viewer 가 됨)
export function checkRoleChange(
  account: { hasPassword: boolean },
  role: CliAdminRole,
): 'ok' | 'password_not_set' {
  return account.hasPassword || role === 'guest' ? 'ok' : 'password_not_set';
}
