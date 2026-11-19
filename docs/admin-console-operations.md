# 어드민 콘솔 운영 가이드

어드민 계정은 서비스 사용자와 분리되어 있고, 화면에서 만들 수 없습니다. 아래 SQL 로 DB 에 직접 관리합니다.
비밀번호 원문은 SQL 히스토리 외에 어디에도 남기지 말고, 임시 비밀번호는 첫 로그인 때 바꾸게 합니다.

## 1. 마이그레이션 적용

1. `drizzle/0026_*.sql` 을 운영 DB 에 적용합니다. 이 마이그레이션은 새 테이블 7개(`admin_account`, `admin_session`, `admin_action_log`, `service_setting`, `ai_prompt`, `ai_prompt_revision`, `ai_prompt_default`)를 만들고 `user` 에 3개 열, `draft_prompt` 에 1개 열을 추가합니다.
2. 기존 `comdraft` 스키마 테이블은 모두 `comdraft` 역할이 소유하고 전체 DML 권한을 갖고 있으며, 앱과 Lambda 가 그 역할로 접속합니다. 그래서 **`comdraft` 역할로 적용**하면 새 테이블도 같은 소유자가 되어 별도 GRANT 가 필요 없습니다.
3. 다른 역할(예: `postgres`)로 적용했다면 새 테이블 7개의 소유자를 바꿉니다.

```sql
alter table comdraft.admin_account owner to comdraft;
alter table comdraft.admin_session owner to comdraft;
alter table comdraft.admin_action_log owner to comdraft;
alter table comdraft.service_setting owner to comdraft;
alter table comdraft.ai_prompt owner to comdraft;
alter table comdraft.ai_prompt_revision owner to comdraft;
alter table comdraft.ai_prompt_default owner to comdraft;
```

4. Lambda 가 쓰는 권한은 `ai_prompt`·`service_setting` 은 select, `ai_prompt_default` 는 select/insert/update/delete 입니다. 소유자가 `comdraft` 이면 이미 충족됩니다.
5. 앱 배포는 마이그레이션 적용 후에 합니다 (앱이 새 열을 읽음).

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

## 6. ADMIN_PATH_KEY 설정

어드민 콘솔 주소의 비밀 경로 값입니다. 운영자가 Vercel 에서 직접 설정합니다.

1. 추측하기 어려운 값을 만듭니다. 예: `openssl rand -hex 16`
2. Vercel 프로젝트 Settings > Environment Variables 에 `ADMIN_PATH_KEY` 를 **Production** 환경으로 추가합니다.
3. 재배포하면 적용됩니다. 값을 바꾸면 이전 주소는 즉시 막힙니다.
4. 값은 저장소, 로그, 채팅에 남기지 않습니다.
