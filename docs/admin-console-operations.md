# 어드민 콘솔 운영 가이드

어드민 계정은 서비스 사용자와 분리되어 있고, 화면에서 만들 수 없습니다. 아래 SQL 로 DB 에 직접 관리합니다.
비밀번호 원문은 SQL 히스토리 외에 어디에도 남기지 말고, 임시 비밀번호는 첫 로그인 때 바꾸게 합니다.

## 1. 마이그레이션 적용

1. `drizzle/0026_*.sql` 을 운영 DB 에 적용합니다. 이 마이그레이션은 새 테이블 7개(`admin_account`, `admin_session`, `admin_action_log`, `service_setting`, `ai_prompt`, `ai_prompt_revision`, `ai_prompt_default`)를 만들고 `user` 에 3개 열, `draft_prompt` 에 1개 열을 추가합니다.
2. 2026-11-19 에 운영 DB 를 읽기 전용 쿼리로 확인한 결과, 기존 `comdraft` 스키마 테이블은 모두 `comdraft` 역할이 소유하고, `comdraft` 가 유일한 grantee(전체 DML)이며, 프로젝트에서 이름에 "comdraft" 가 들어간 비시스템 역할도 `comdraft` 하나뿐입니다. 앱과 Lambda 는 그 역할로 접속합니다. 적용 전에 아래 쿼리로 다시 확인할 수 있습니다.

```sql
select tableowner from pg_tables where schemaname = 'comdraft';
select grantee, privilege_type from information_schema.role_table_grants where table_schema = 'comdraft';
```

3. 기본 경로는 **`comdraft` 역할로 마이그레이션을 적용**하는 것입니다. 새 테이블도 같은 소유자가 되어 별도 GRANT 가 필요 없습니다.
4. 다른 역할(예: `postgres`)로 적용했다면 새 테이블 7개의 소유자를 바꿉니다. `alter table ... owner to comdraft` 는 실행하는 역할이 `comdraft` 의 멤버이거나 superuser 여야 합니다.

```sql
alter table comdraft.admin_account owner to comdraft;
alter table comdraft.admin_session owner to comdraft;
alter table comdraft.admin_action_log owner to comdraft;
alter table comdraft.service_setting owner to comdraft;
alter table comdraft.ai_prompt owner to comdraft;
alter table comdraft.ai_prompt_revision owner to comdraft;
alter table comdraft.ai_prompt_default owner to comdraft;
```

소유자를 바꿀 수 없으면 대신 `comdraft` 에 권한을 줍니다.

```sql
grant select, insert, update, delete on comdraft.admin_account to comdraft;
grant select, insert, update, delete on comdraft.admin_session to comdraft;
grant select, insert, update, delete on comdraft.admin_action_log to comdraft;
grant select, insert, update, delete on comdraft.service_setting to comdraft;
grant select, insert, update, delete on comdraft.ai_prompt to comdraft;
grant select, insert, update, delete on comdraft.ai_prompt_revision to comdraft;
grant select, insert, update, delete on comdraft.ai_prompt_default to comdraft;
```

5. Lambda 가 쓰는 권한은 `ai_prompt`·`service_setting` 은 select, `ai_prompt_default` 는 select/insert/update/delete 입니다. 소유자가 `comdraft` 이거나 위 GRANT 를 적용했다면 충족됩니다.
6. 앱 배포는 마이그레이션 적용 후에 합니다 (앱이 새 열을 읽음).

## 2. 어드민 계정 만들기

`pgcrypto` 는 Supabase 에서 `extensions` 스키마에 있습니다. 새 계정은 `guest` 이며 임시 비밀번호로 로그인해 본인 비밀번호를 정해야 `viewer` 이상으로 쓸 수 있습니다.

```sql
insert into comdraft.admin_account (id, login_id, temp_password_hash)
values (
  gen_random_uuid()::text,
  '<아이디>',
  extensions.crypt('<임시 비밀번호>', extensions.gen_salt('bf', 12))
);
```

## 3. 권한 올리기

등급은 `guest` < `viewer` < `editor` < `admin` 입니다.

```sql
update comdraft.admin_account
set role = 'admin', updated_at = now()
where login_id = '<아이디>';
```

## 4. 비밀번호 재발급

임시 해시를 다시 넣고 본인 비밀번호를 비우며 `guest` 로 내립니다. 기존 로그인 세션도 끊습니다.

```sql
update comdraft.admin_account
set temp_password_hash = extensions.crypt('<새 임시 비밀번호>', extensions.gen_salt('bf', 12)),
    password_hash = null,
    role = 'guest',
    failed_attempts = 0,
    locked_until = null,
    updated_at = now()
where login_id = '<아이디>';

delete from comdraft.admin_session
where admin_id = (select id from comdraft.admin_account where login_id = '<아이디>');
```

재발급 후 다시 권한을 올려야 합니다 (3번).

## 5. 잠금 풀기

```sql
update comdraft.admin_account
set failed_attempts = 0, locked_until = null, updated_at = now()
where login_id = '<아이디>';
```

잠금 시간이 지나도 실패 횟수는 로그인에 성공할 때까지 남아 있어, 한 번 더 실패하면 다시 15분간 잠깁니다.

## 6. ADMIN_PATH_KEY 설정

어드민 콘솔 주소의 비밀 경로 값입니다. 운영자가 Vercel 에서 직접 설정합니다.

1. 추측하기 어려운 값을 만듭니다. 예: `openssl rand -hex 16`
2. Vercel 프로젝트 Settings > Environment Variables 에 `ADMIN_PATH_KEY` 를 **Production 환경에만** 추가합니다. Preview 에는 절대 넣지 않습니다 (프리뷰는 검토 전 브랜치 코드가 운영 DB 에 연결된 채 돌기 때문입니다).
3. 재배포하면 적용됩니다. 값을 바꾸면 이전 주소는 즉시 막힙니다.
4. 값은 저장소, 로그, 채팅에 남기지 않습니다.

주소의 키는 화면을 숨기는 용도일 뿐이며, 서버 액션은 키와 무관하게 어드민 로그인, 역할, 요청 제한으로 보호됩니다 (키가 유일한 방어선이 아닙니다).

## 7. 배포 순서

1. 운영자가 `drizzle/0026_*.sql` 마이그레이션을 로컬, 운영 순서로 `comdraft` 역할로 적용합니다 (1절).
2. Vercel Production 에 `ADMIN_PATH_KEY` 를 설정하고, 로컬은 `.env.development` 에 넣습니다 (6절).
3. comdraft 를 배포합니다.
4. 운영자가 comdraft-lambda 에서 `pnpm build` 후 `terraform plan` 으로 변경 내용을 확인하고 `terraform apply` 합니다.
5. Lambda 가 처음 콜드 스타트하면 프롬프트 기본값을 `ai_prompt_default` 에 올립니다. 그 전까지 AI 프롬프트 화면에는 "기본값을 올리지 않았어요" 가 표시됩니다.
6. 2절의 SQL 로 첫 어드민 계정을 넣고, 로그인해서 비밀번호를 정합니다.
