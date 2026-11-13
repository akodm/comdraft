/* global process, fetch, console -- Node 로 직접 실행하는 스크립트 */
/**
 * 기존 사용자의 GitHub 아이디(user.github_login) 채우기 (일회성, 다시 실행해도 안전)
 * - 실행: pnpm db:backfill-github-login:local / pnpm db:backfill-github-login:prod
 * - github_login 이 비어 있는 사용자만, GitHub 계정의 숫자 ID 로 공개 API 를 불러 login 을 저장
 * - 조회 실패(404, 탈퇴 계정, 호출 제한)는 건너뜀 → 인증 없는 호출은 시간당 60회라 많으면 한 시간 뒤 다시 실행
 * - 개인정보 없이 결과 개수만 출력
 */
import postgres from 'postgres';

const GITHUB_LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL 환경 변수가 설정되지 않았습니다.');
}

const sql = postgres(databaseUrl, { max: 1, prepare: false });

// GitHub 숫자 ID 로 현재 login 조회 (없거나 실패하면 null)
const fetchGithubLogin = async (accountId) => {
  const response = await fetch(`https://api.github.com/user/${accountId}`, {
    headers: {
      'User-Agent': 'comdraft-backfill',
      Accept: 'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    return null;
  }

  const { login } = await response.json();

  return typeof login === 'string' && GITHUB_LOGIN.test(login) ? login : null;
};

try {
  const rows = await sql`
    select u.id as user_id, a.account_id
    from comdraft."user" u
    join comdraft.account a on a.user_id = u.id and a.provider_id = 'github'
    where u.github_login is null
  `;

  let updated = 0;
  let skipped = 0;

  for (const { user_id: userId, account_id: accountId } of rows) {
    const login = await fetchGithubLogin(accountId);

    if (!login) {
      skipped += 1;
      continue;
    }

    await sql`
      update comdraft."user" set github_login = ${login}
      where id = ${userId} and github_login is null
    `;
    updated += 1;
  }

  console.log(`updated ${updated} / skipped ${skipped}`);
} finally {
  await sql.end();
}
