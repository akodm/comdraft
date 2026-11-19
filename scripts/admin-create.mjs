/* global process, console -- Node 로 직접 실행하는 스크립트 */
/**
 * 어드민 계정 만들기 / 임시 비밀번호 재발급
 * - 실행: pnpm admin:create:local <아이디> [--reset] / pnpm admin:create:prod <아이디> [--reset]
 * - 새 계정은 guest 로 만들고, --reset 이면 임시 비밀번호를 다시 발급하고 guest 로 내린 뒤 세션을 모두 끊음
 * - 임시 비밀번호는 화면에 한 번만 출력하고 다른 곳에는 저장하지 않음 (DB 에는 해시만)
 */
/* eslint-disable no-relative-import-paths/no-relative-import-paths -- Node 는 @/ 별칭을 풀지 못해 상대 경로 + .ts 확장자로 가져옴 */
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import {
  generateTempPassword,
  parseAdminCreateArgs,
} from '../lib/admin/account-cli.ts';
import { hashPassword } from '../lib/admin/password.ts';

const USAGE =
  '사용법: pnpm admin:create:local|prod <아이디> [--reset]\n아이디는 영문, 숫자, . _ - 만 쓸 수 있고 3~64자여야 해요.';

const parsed = parseAdminCreateArgs(process.argv.slice(2));

if ('error' in parsed) {
  console.error(
    parsed.error === 'invalid_login_id'
      ? `아이디 형식이 올바르지 않아요.\n${USAGE}`
      : USAGE,
  );
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL 환경 변수가 설정되지 않았습니다.');
}

const { loginId, reset } = parsed;
const sql = postgres(databaseUrl, { max: 1, prepare: false });

// 새 계정: 아이디가 이미 있으면 아무것도 넣지 않고 빈 결과를 돌려줌
const createAccount = async (hash) => {
  const rows = await sql`
    insert into comdraft.admin_account (id, login_id, temp_password_hash)
    values (${randomUUID()}, ${loginId}, ${hash})
    on conflict (login_id) do nothing
    returning id
  `;

  return rows.length > 0;
};

// 재발급: 계정 갱신과 세션 삭제를 한 트랜잭션으로 처리
const resetAccount = (hash) =>
  sql.begin(async (tx) => {
    const rows = await tx`
      update comdraft.admin_account
      set temp_password_hash = ${hash},
          password_hash = null,
          role = 'guest',
          failed_attempts = 0,
          locked_until = null,
          updated_at = now()
      where login_id = ${loginId}
      returning id
    `;

    if (rows.length === 0) {
      return false;
    }
    await tx`delete from comdraft.admin_session where admin_id = ${rows[0].id}`;

    return true;
  });

let exitCode = 0;

try {
  const tempPassword = generateTempPassword();
  const hash = await hashPassword(tempPassword);
  const done = reset ? await resetAccount(hash) : await createAccount(hash);

  if (!done) {
    console.error(
      reset
        ? '그 아이디의 계정이 없어요. --reset 없이 새로 만들어 주세요.'
        : '이미 있는 아이디예요. 비밀번호를 다시 발급하려면 --reset 을 붙이세요.',
    );
    exitCode = 1;
  } else {
    console.log(
      reset ? '임시 비밀번호를 다시 발급했어요.' : '계정을 만들었어요.',
    );
    console.log(`아이디: ${loginId}`);
    console.log(`임시 비밀번호: ${tempPassword} (지금 한 번만 보여요)`);
    console.log(
      '로그인 주소: /<lang>/admin/<ADMIN_PATH_KEY>/login — 첫 로그인 때 비밀번호를 바꾸게 돼요.',
    );
    console.log(
      '권한은 guest 예요. 로그인 전에 viewer 이상으로 올려야 해요 (운영 가이드 3절).',
    );
  }
} finally {
  await sql.end();
}

process.exit(exitCode);
