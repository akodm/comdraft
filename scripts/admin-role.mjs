/* global process, console -- Node 로 직접 실행하는 스크립트 */
/**
 * 어드민 권한 바꾸기
 * - 실행: pnpm admin:role:local <아이디> <guest|viewer|editor|admin> / pnpm admin:role:prod ...
 * - 본인 비밀번호를 정하기 전(첫 로그인 전)에는 guest 로만 둘 수 있음
 * - 권한은 요청마다 DB 에서 읽으므로 바꾸면 이미 로그인한 세션에도 바로 반영됨
 */
/* eslint-disable no-relative-import-paths/no-relative-import-paths -- Node 는 @/ 별칭을 풀지 못해 상대 경로 + .ts 확장자로 가져옴 */
import postgres from 'postgres';
import {
  CLI_ADMIN_ROLES,
  checkRoleChange,
  parseAdminRoleArgs,
} from '../lib/admin/account-cli.ts';

const USAGE = `사용법: pnpm admin:role:local|prod <아이디> <${CLI_ADMIN_ROLES.join('|')}>`;

const parsed = parseAdminRoleArgs(process.argv.slice(2));

if ('error' in parsed) {
  const reason = {
    usage: '',
    invalid_login_id: '아이디 형식이 올바르지 않아요.\n',
    invalid_role: '모르는 권한이에요.\n',
  }[parsed.error];

  console.error(`${reason}${USAGE}`);
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL 환경 변수가 설정되지 않았습니다.');
}

const { loginId, role } = parsed;
const sql = postgres(databaseUrl, { max: 1, prepare: false });

let exitCode = 0;

try {
  // 비밀번호 확인과 변경을 한 문장으로: 비밀번호를 정하기 전이면 guest 만 허용
  const rows = await sql`
    update comdraft.admin_account
    set role = ${role}, updated_at = now()
    where login_id = ${loginId}
      and (password_hash is not null or ${role} = 'guest')
    returning role
  `;

  if (rows.length > 0) {
    console.log(`${loginId} 의 권한을 ${role} 로 바꿨어요.`);
  } else {
    const [account] = await sql`
      select password_hash is not null as "hasPassword"
      from comdraft.admin_account
      where login_id = ${loginId}
    `;

    if (!account) {
      console.error('그 아이디의 계정이 없어요.');
    } else if (checkRoleChange(account, role) === 'password_not_set') {
      console.error(
        '아직 첫 로그인을 하지 않은 계정이에요. 임시 비밀번호로 로그인해 비밀번호를 정한 뒤(자동으로 viewer) 다시 실행해 주세요.',
      );
    } else {
      console.error('권한을 바꾸지 못했어요. 다시 시도해 주세요.');
    }
    exitCode = 1;
  }
} finally {
  await sql.end();
}

process.exit(exitCode);
