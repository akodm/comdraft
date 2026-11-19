# 어드민 콘솔 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** comdraft 안에 `/[lang]/admin/<키>` 어드민 콘솔(통계, 사용자·게시글·프롬프트 내역 관리, AI 프롬프트 수정, AI 중지)을 만들고, comdraft-lambda 가 사용량 초기화·AI 중지·사용자 밴·프롬프트 수정본을 반영하게 한다.

**Architecture:** 어드민은 Better Auth 와 분리된 전용 테이블·쿠키로 인증하고, 권한은 `guest < viewer < editor < admin` 표 하나로 판정한다. 서비스 쪽(comdraft 작성 요청 검사, Lambda 작업 시작)은 `service_setting`·`user.banned_at`·`user.quota_reset_at` 을 읽어 막거나 계산한다. AI 프롬프트는 Lambda 코드가 기본값이고, DB 에는 수정본만 두며, Lambda 가 콜드 스타트 때 기본값을 `ai_prompt_default` 에 올린다.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind v4, lucide-react, Lingui, Drizzle ORM (Postgres, `comdraft` 스키마), Vitest / Lambda: Node 22, postgres.js, `node:test`

**Spec:** `docs/superpowers/specs/2026-11-19-admin-console-design.md`

## Global Constraints

- 브랜치: comdraft `feat/admin-console` (이미 만듦, `design/hallmark-restyle` 위), comdraft-lambda `feat/admin-controls` (`main` 에서 새로 만듦). git worktree 를 쓰지 않고 각 저장소의 main checkout 에서 브랜치로 작업
- pnpm 은 항상 `export PATH=/Users/junmyeongjo/.nvm/versions/node/v24.12.0/bin:$PATH;` 를 앞에 붙여 11.24 로 실행
- **마이그레이션 적용 금지**: `pnpm db:generate` 로 SQL 만 만들고 `db:migrate:*` 는 실행하지 않음. 적용은 운영자가 함
- comdraft-lambda 에서는 prettier 를 돌리지 않음
- Tailwind v4, 아이콘은 lucide 만, 문구는 Lingui (`ko` 기본, `en` 도 채움). 문구 추가 후 `pnpm i18n:extract`
- 비밀번호 평문을 DB·로그·쿼리 파라미터에 남기지 않음. 해싱은 Node 의 `bcryptjs` (cost 12)
- 커밋은 각 Task 의 commit 단계에서만, 커밋 메시지는 한국어 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. push·PR·병합·배포는 하지 않음
- 오류 코드는 comdraft `lib/generation/contract.ts` 와 lambda `src/contract.ts` 에 같은 이름·같은 순서로 추가
- 환경 변수 `ADMIN_PATH_KEY`: `^[A-Za-z0-9_-]{16,}$`. 없거나 형식이 틀리면 어드민 전체 403
- 권한 표 (서버 액션 검사가 기준):
  - viewer: 모든 조회
  - editor: `user.ban`, `user.unban`, `user.revokeSessions`, `user.resetUsage`, `user.changePlan`, `post.ban`, `post.unban`, `prompt.edit`
  - admin: editor 권한 + `post.delete`, `history.delete`, `ai.pause`, `ai.resume`
- 비밀번호 규칙: 12자 이상, 아이디와 다름. 로그인 실패 5회 → 15분 잠금, IP 당 1시간 실패 20회 초과 거부. 어드민 세션 12시간, 연장 없음
- 프롬프트 수정본 최대 20,000자
- 배포 순서: 마이그레이션 → comdraft → Lambda (운영자가 진행)

## Review Focus

1. **밴된 사용자가 이미 열어 둔 탭에서 서버 액션 호출** → `requireSession` 이 거부하고 로그인 화면으로 보냄 (Task 5 테스트)
2. **주소 키의 변형** (`/ko/admin/<키>/` 끝 슬래시, 대소문자만 다른 키, URL 인코딩된 키, `/ko/admin` 만) → 정확히 같은 키만 통과, 나머지 403 (Task 3 테스트)
3. **guest 세션으로 서버 액션 직접 POST** (비밀번호 변경 외) → 화면 숨김과 상관없이 거부 (Task 4 테스트)
4. **en 로케일 작업인데 ko 만 수정된 경우, 또는 수정본이 마커를 잃은 채 DB 에 직접 들어간 경우** → en 은 기본값, 마커를 잃은 키는 기본값 (Task 13 테스트)
5. **진행 중 작업의 프롬프트 내역 삭제 요청** → 거부되고 사용량·잠금 상태가 그대로 (Task 10 테스트)

---

### Task 1: 스키마와 마이그레이션 SQL (comdraft)

**Files:**
- Create: `lib/db/schema/admin.ts`
- Modify: `lib/db/schema/auth.ts` (user 열), `lib/db/schema/draft.ts` (draftPrompt 열), `lib/db/schema/index.ts`
- Create: `drizzle/0026_*.sql` (`pnpm db:generate` 결과)
- Create: `docs/admin-console-operations.md`

**Interfaces:**
- Produces (Drizzle 테이블, `comdraftSchema.table`):
  - `adminAccount`: `id` text pk, `loginId` text unique notNull, `tempPasswordHash` text null, `passwordHash` text null, `role` text `$type<AdminRole>()` default `'guest'` notNull (check `in ('guest','viewer','editor','admin')`), `failedAttempts` integer default 0, `lockedUntil` timestamptz null, `passwordChangedAt`, `lastLoginAt` timestamptz null, `createdAt`, `updatedAt`
  - `adminSession`: `id` text pk, `adminId` → adminAccount (cascade), `tokenHash` text unique, `expiresAt`, `ipAddress`, `userAgent`, `createdAt`
  - `adminActionLog`: `id` text pk, `adminId` → adminAccount (set null), `action` text, `targetType` text, `targetId` text null, `detail` jsonb default `{}`, `createdAt` (index on `createdAt`, and on `(targetType, targetId)`)
  - `serviceSetting`: `key` text pk, `value` jsonb notNull, `updatedBy` → adminAccount null, `updatedAt`
  - `aiPrompt`: `locale` text, `key` text, `content` text notNull, `updatedBy`, `updatedAt`, pk (`locale`,`key`)
  - `aiPromptRevision`: `id` text pk, `locale`, `key`, `content` text null, `adminId`, `createdAt` (index (`locale`,`key`,`createdAt`))
  - `aiPromptDefault`: `locale`, `key`, `content` text notNull, `requiredMarkers` text[] default `{}`, `version` text notNull, `updatedAt`, pk (`locale`,`key`)
  - `user` 에 `bannedAt` timestamptz null, `banReason` text null, `quotaResetAt` timestamptz null
  - `draftPrompt` 에 `deletedAt` timestamptz null
  - `export const ADMIN_ROLES = ['guest','viewer','editor','admin'] as const; export type AdminRole`
  - `export const AI_GENERATION_SETTING_KEY = 'ai_generation'`, `export interface AiGenerationSetting { paused: boolean; reason: string | null }`

- [ ] **Step 1: 스키마 작성** — 기존 파일의 주석 스타일(한국어, 열마다 한 줄)을 따름. timestamptz 는 `{ withTimezone: true, precision: 3 }`
- [ ] **Step 2: 타입 확인** — Run: `pnpm exec tsc --noEmit` / Expected: 오류 없음
- [ ] **Step 3: SQL 생성** — Run: `pnpm db:generate` / Expected: `drizzle/0026_<이름>.sql` 하나가 생기고, CREATE TABLE 7개와 ALTER TABLE ADD COLUMN 4개만 들어 있음. `db:migrate:*` 는 실행하지 않음
- [ ] **Step 4: 운영 문서 작성** — `docs/admin-console-operations.md` 에:
  - 마이그레이션 적용 순서와 필요한 GRANT. 역할 이름은 Supabase MCP `execute_sql` 로 읽기 전용 조회(`select grantee, privilege_type from information_schema.role_table_grants where table_schema='comdraft' and table_name='post'`)해서 기존 테이블과 같은 역할에 같은 권한을 주도록 적음. Lambda 쪽은 `ai_prompt`·`service_setting` select, `ai_prompt_default` select/insert/update/delete
  - 어드민 계정 넣기 SQL: `insert into comdraft.admin_account (id, login_id, temp_password_hash) values (gen_random_uuid()::text, '<아이디>', extensions.crypt('<임시 비밀번호>', extensions.gen_salt('bf', 12)));`
  - 권한 올리기, 비밀번호 재발급(임시 해시 넣고 `password_hash` 를 null, `role='guest'`), 잠금 풀기 SQL
  - `ADMIN_PATH_KEY` 설정 방법 (Vercel Production 에 운영자가 직접)
- [ ] **Step 5: Commit**

```bash
git add lib/db/schema drizzle docs/admin-console-operations.md
git commit -m "feat: 어드민 콘솔 스키마와 마이그레이션 SQL 추가"
```

---

### Task 2: 권한·비밀번호·토큰 순수 로직 (comdraft)

**Files:**
- Create: `lib/admin/roles.ts`, `lib/admin/password.ts`, `lib/admin/token.ts`
- Test: `lib/admin/roles.test.ts`, `lib/admin/password.test.ts`, `lib/admin/token.test.ts`
- Modify: `package.json` (`bcryptjs` 의존성)

**Interfaces:**
- Consumes: `AdminRole`, `ADMIN_ROLES` (Task 1)
- Produces:
  - `export const ADMIN_ACTIONS` (Global Constraints 의 액션 이름 13개 + `'view'`), `type AdminAction`
  - `canPerform(role: AdminRole, action: AdminAction): boolean`
  - `canEnter(role: AdminRole, hasPendingTempPassword: boolean): 'console' | 'password' | 'denied'` — guest + 임시 비밀번호 있음 → `'password'`, guest + 없음 → `'denied'`, 그 외에 임시 비밀번호 있음 → `'password'`, 아니면 `'console'`
  - `validateNewPassword(loginId: string, password: string, confirm: string): 'ok' | 'too_short' | 'same_as_login' | 'mismatch'`
  - `hashPassword(plain: string): Promise<string>` (cost 12), `verifyPassword(plain: string, hash: string | null): Promise<boolean>` — hash 가 null 이면 `DUMMY_HASH` 와 비교해 시간을 맞추고 false
  - `createSessionToken(): { token: string; tokenHash: string }` (32바이트 base64url, SHA-256 hex), `hashSessionToken(token: string): string`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// roles.test.ts
it.each([
  ['viewer', 'view', true], ['viewer', 'user.ban', false],
  ['editor', 'prompt.edit', true], ['editor', 'post.delete', false],
  ['admin', 'ai.pause', true], ['guest', 'view', false],
])('%s 의 %s 권한은 %s', (role, action, ok) => {
  expect(canPerform(role, action)).toBe(ok);
});
it('임시 비밀번호가 남은 guest 는 변경 화면만', () => expect(canEnter('guest', true)).toBe('password'));
it('비밀번호를 정한 뒤 guest 로 돌아가면 입장 불가', () => expect(canEnter('guest', false)).toBe('denied'));
it('viewer 라도 임시 비밀번호가 다시 발급되면 변경 화면으로', () => expect(canEnter('viewer', true)).toBe('password'));

// password.test.ts
// PGCRYPTO_HASH: Step 2 에서 `select extensions.crypt('temp-pass-1234', extensions.gen_salt('bf', 12))` 로 만든 $2a$ 문자열을 상수로 붙여 넣음
it('pgcrypto 가 만든 bcrypt 해시를 확인함', async () => {
  expect(await verifyPassword('temp-pass-1234', PGCRYPTO_HASH)).toBe(true);
  expect(await verifyPassword('wrong', PGCRYPTO_HASH)).toBe(false);
});
it('해시가 없으면 false', async () => expect(await verifyPassword('x', null)).toBe(false));
it('새 비밀번호 검사', () => {
  expect(validateNewPassword('jayden', 'short', 'short')).toBe('too_short');
  expect(validateNewPassword('jayden-admin', 'jayden-admin', 'jayden-admin')).toBe('same_as_login');
  expect(validateNewPassword('jayden', 'a-long-password-1', 'a-long-password-2')).toBe('mismatch');
  expect(validateNewPassword('jayden', 'a-long-password-1', 'a-long-password-1')).toBe('ok');
});

// token.test.ts
it('토큰의 해시가 hashSessionToken 과 같음', () => {
  const { token, tokenHash } = createSessionToken();
  expect(hashSessionToken(token)).toBe(tokenHash);
  expect(token).not.toBe(tokenHash);
});
```

- [ ] **Step 2: pgcrypto 해시 상수 만들기** — Supabase MCP `execute_sql` 로 위 `select` 한 줄을 실행(함수 계산만 하고 아무것도 쓰지 않음)해 결과를 `PGCRYPTO_HASH` 에 넣음. 로컬 Postgres 에 pgcrypto 가 있으면 그쪽을 써도 됨
- [ ] **Step 3: 실패 확인** — Run: `pnpm test lib/admin` / Expected: 모듈 없음으로 FAIL
- [ ] **Step 4: 구현** — `pnpm add bcryptjs` 후 위 시그니처대로. `DUMMY_HASH` 는 모듈 로드 시 한 번 만든 고정 해시
- [ ] **Step 5: 통과 확인** — Run: `pnpm test lib/admin` / Expected: PASS
- [ ] **Step 6: Commit** — `feat: 어드민 권한 표와 비밀번호·세션 토큰 처리 추가`

---

### Task 3: 주소 키 검사와 proxy (comdraft)

**Files:**
- Create: `lib/admin/path-key.ts`, Test: `lib/admin/path-key.test.ts`
- Modify: `proxy.ts`

**Interfaces:**
- Produces:
  - `isValidAdminKey(key: string | undefined): key is string`
  - `getAdminPathDecision(path: string, key: string | undefined): 'not_admin' | 'allow' | 'forbidden'` — `path` 는 로케일을 뺀 경로(`splitLocalePath` 결과). `/admin` 으로 시작하지 않으면 `not_admin`. 두 번째 세그먼트가 키와 정확히 같으면 `allow` (비교는 `crypto.timingSafeEqual`, 길이가 다르면 같은 길이의 더미와 비교 후 false)
  - `matchesAdminKey(candidate: string, key: string | undefined): boolean` (레이아웃 재확인용)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const KEY = 'k3y_abcdefghijklmn';
it.each([
  ['/posts/admin', 'not_admin'], ['/admins', 'not_admin'],
  ['/admin', 'forbidden'], ['/admin/', 'forbidden'],
  [`/admin/${KEY}`, 'allow'], [`/admin/${KEY}/`, 'allow'], [`/admin/${KEY}/users`, 'allow'],
  [`/admin/${KEY.toUpperCase()}`, 'forbidden'], ['/admin/k3y%5Fabcdefghijklmn', 'forbidden'],
  ['/admin/wrong-key-0000000', 'forbidden'],
])('%s → %s', (path, expected) => expect(getAdminPathDecision(path, KEY)).toBe(expected));
it('키가 없거나 형식이 틀리면 어드민 경로는 모두 forbidden', () => {
  expect(getAdminPathDecision(`/admin/${KEY}`, undefined)).toBe('forbidden');
  expect(getAdminPathDecision('/admin/short', 'short')).toBe('forbidden');
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test lib/admin/path-key` / Expected: FAIL
- [ ] **Step 3: 구현** — 위 시그니처대로. proxy 는 로케일이 있는 요청에서 `getAdminPathDecision` 이 `forbidden` 이면 `new NextResponse(null, { status: 403 })`, `allow` 면 사용자 세션 리다이렉트(`isProtectedPath`)를 건너뛰고 기존 헤더 처리로 진행. 로케일 없는 요청은 기존 리다이렉트 그대로
- [ ] **Step 4: 통과 확인** — Run: `pnpm test lib/admin/path-key` / Expected: PASS
- [ ] **Step 5: Commit** — `feat: 어드민 주소 키 검사를 proxy 에 추가`

---

### Task 4: 어드민 인증 서버 로직과 조치 기록 (comdraft)

**Files:**
- Create: `lib/admin/login.ts` (순수 판정), Test: `lib/admin/login.test.ts`
- Create: `lib/admin/session.ts` (server-only: 쿠키·DB), `lib/admin/audit.ts`, `lib/admin/guard.ts`
- Create: `lib/actions/admin/auth.ts` (서버 액션: 로그인, 비밀번호 변경, 로그아웃)
- Test: `lib/admin/guard.test.ts`

**Interfaces:**
- Consumes: Task 1 테이블, Task 2 함수, Task 3 `matchesAdminKey`
- Produces:
  - `evaluateLogin(account: LoginAccount | null, passwordOk: boolean, now: Date): LoginOutcome` — `LoginOutcome = { kind: 'locked'; until: Date } | { kind: 'failed'; lockUntil: Date | null } | { kind: 'denied' } | { kind: 'ok'; next: 'console' | 'password' }`. 잠금 중이면 비밀번호를 확인하지 않고 `locked`. 실패가 5번째면 `lockUntil = now + 15분`. 성공해도 `canEnter` 가 `denied` 면 `denied`
  - `getAdminSession(): Promise<AdminSessionContext | null>` (React `cache`), `AdminSessionContext = { adminId; loginId; role; next: 'console' | 'password' }`
  - `requireAdmin(action: AdminAction): Promise<AdminSessionContext>` — 세션 없음 → 로그인 화면 redirect, `next==='password'` → 변경 화면 redirect, 권한 없음 → `forbidden()`
  - `requireAdminPasswordStep(): Promise<AdminSessionContext>` — 변경 화면·변경 액션 전용
  - `logAdminAction(input: { adminId: string; action: AdminAction | 'auth.login' | 'auth.password' | 'auth.logout'; targetType: string; targetId?: string; detail?: Record<string, unknown> }): Promise<void>`
  - 어드민 주소 만들기: `adminPath(lang: Locale, key: string, sub?: string): string`
  - 쿠키: `comdraft_admin`, HttpOnly, `secure: process.env.NODE_ENV === 'production'`, SameSite `strict`, path `/`, maxAge 12시간
  - IP 제한: 기존 `rateLimit` 테이블에 키 `admin-login:<ip>` 로 1시간 창 실패 수를 셈
  - 비밀번호 변경 성공: `passwordHash` 저장, `tempPasswordHash=null`, guest 면 `viewer`, `passwordChangedAt=now`, 현재 세션을 뺀 이 계정의 세션 삭제
  - 비밀번호 변경 액션은 두 경우를 함께 처리: 임시 비밀번호 단계(`next==='password'`)면 현재 비밀번호 칸 없이, 콘솔에서 바꿀 때(프로필 메뉴)는 현재 비밀번호를 `verifyPassword` 로 확인한 뒤
- Modify: `next.config.ts` 에 `experimental.authInterrupts: true` (`forbidden()` 사용)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// login.test.ts
const now = new Date('2026-11-19T00:00:00Z');
const base = { role: 'viewer', failedAttempts: 0, lockedUntil: null, hasTempPassword: false } as const;
it('잠금 중이면 비밀번호와 상관없이 locked', () =>
  expect(evaluateLogin({ ...base, lockedUntil: new Date('2026-11-19T00:10:00Z') }, true, now).kind).toBe('locked'));
it('다섯 번째 실패에 15분 잠금', () =>
  expect(evaluateLogin({ ...base, failedAttempts: 4 }, false, now))
    .toEqual({ kind: 'failed', lockUntil: new Date('2026-11-19T00:15:00Z') }));
it('없는 계정은 failed 이고 잠금 없음', () =>
  expect(evaluateLogin(null, false, now)).toEqual({ kind: 'failed', lockUntil: null }));
it('비밀번호를 정한 guest 는 성공해도 denied', () =>
  expect(evaluateLogin({ ...base, role: 'guest' }, true, now).kind).toBe('denied'));
it('임시 비밀번호 로그인은 변경 화면으로', () =>
  expect(evaluateLogin({ ...base, role: 'guest', hasTempPassword: true }, true, now))
    .toEqual({ kind: 'ok', next: 'password' }));

// guard.test.ts: getAdminSession 을 vi.mock 으로 바꿔 requireAdmin 의 분기만 확인
it('guest(변경 단계) 세션으로 콘솔 액션을 부르면 변경 화면으로 redirect', ...);
it('viewer 가 user.ban 을 부르면 forbidden', ...);
it('editor 가 prompt.edit 를 부르면 통과', ...);
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test lib/admin` / Expected: 새 테스트 FAIL
- [ ] **Step 3: 구현** — 로그인 액션은 계정 조회 → `verifyPassword`(임시 해시가 있으면 임시 해시, 없으면 `passwordHash`, 계정이 없으면 null) → `evaluateLogin` → 실패 수·잠금·IP 카운트 갱신 → 성공 시 `createSessionToken` 으로 세션 행과 쿠키. 실패 응답 문구는 하나로 통일. 모든 서버 액션의 첫 줄은 `requireAdmin(...)` 또는 `requireAdminPasswordStep()`
- [ ] **Step 4: 통과 확인** — Run: `pnpm test lib/admin` / Expected: PASS
- [ ] **Step 5: Commit** — `feat: 어드민 로그인·비밀번호 변경·세션과 조치 기록 추가`

---

### Task 5: 서비스 쪽 제재 반영 (comdraft)

**Files:**
- Modify: `lib/generation/quota.ts` (사용량 구간 시작), `lib/generation/quota-queries.ts`, `lib/generation/contract.ts` (오류 코드 `service_paused`, `user_banned`), `lib/actions/generation.ts` (`checkGenerationGate` + 되묻기 재개), `lib/auth/session.ts`, `lib/auth/index.ts` (session.create.before 훅), `lib/auth/user-fields.ts` (`bannedAt`)
- Create: `lib/admin/service-setting.ts` (`getAiGenerationSetting(): Promise<AiGenerationSetting>`, 행이 없으면 `{ paused: false, reason: null }`)
- Modify: 오류 안내 문구 (`locales/ko`, `locales/en`, 오류 코드 → 문구 매핑이 있는 곳)
- Test: `lib/generation/quota.test.ts`, `lib/auth/session.test.ts` (새로), 기존 gate 테스트가 있으면 그곳

**Interfaces:**
- Produces:
  - `getUsageWindowStart(weekStart: Date, quotaResetAt: Date | null): Date` → 둘 중 늦은 시각
  - `GENERATION_ERROR_CODES` 끝에 `'service_paused'`, `'user_banned'` (Task 11 에서 Lambda 에 같은 순서로)
  - `GenerationGateResult` 에 `{ status: 'service_paused' }`, `{ status: 'user_banned' }`
  - `requireSession`: `session.user.bannedAt` 이 있으면 그 사용자의 세션을 지우고 로그인 화면으로 (`?error=banned` 쿼리로 안내)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('초기화 시점이 주 시작보다 늦으면 초기화 시점부터 셈', () => {
  expect(getUsageWindowStart(new Date('2026-11-15T15:00:00Z'), new Date('2026-11-18T03:00:00Z')))
    .toEqual(new Date('2026-11-18T03:00:00Z'));
  expect(getUsageWindowStart(new Date('2026-11-15T15:00:00Z'), null)).toEqual(new Date('2026-11-15T15:00:00Z'));
});
it('플랜을 내려 한도를 넘으면 사용률이 100% 를 넘고 남은 양이 음수', () => {
  const summary = summarizeQuota({ ...plan, weeklyCostLimit: 1_000_000 }, [completedJob(1_230_000)], now);
  expect(summary.remaining).toBeLessThan(0);
  expect(Math.round((summary.used / summary.limit) * 100)).toBe(123); // 화면의 사용률 표시는 used / limit
});
it('시작 전에 거부된 작업(service_paused, used_cost 0)은 사용량 0', () =>
  expect(getJobUsage({ status: 'failed', errorCode: 'service_paused', estimatedCost: 500, usedCost: 0 })).toBe(0));
it('밴된 사용자의 세션으로 requireSession 을 부르면 로그인 화면으로', ...); // getSession 을 vi.mock
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test lib/generation lib/auth` / Expected: 새 테스트 FAIL (100% 초과 테스트가 바로 통과하면 지금 계산이 이미 맞다는 뜻이므로 그대로 둠)
- [ ] **Step 3: 구현**
  - `getUserQuota` 는 `user.quotaResetAt` 도 읽어 `gte(draftPrompt.createdAt, getUsageWindowStart(start, resetAt))`
  - `checkGenerationGate` 맨 앞: AI 중지면 `service_paused`, 사용자 `bannedAt` 이면 `user_banned`. 되묻기 재개(`resumeClarifiedJob`)도 같은 검사를 거침 (작업 상태는 바꾸지 않음)
  - Better Auth `databaseHooks.session.create.before`: 사용자가 밴이면 `false` 를 돌려 세션을 만들지 않음
- [ ] **Step 4: 통과 확인** — Run: `pnpm test` / Expected: 전체 PASS
- [ ] **Step 5: Commit** — `feat: AI 중지·사용자 밴·사용량 초기화를 작성 요청과 세션에 반영`

---

### Task 6: 숨긴 프롬프트 내역 제외 (comdraft)

**Files:**
- Modify: `lib/actions/repository-settings.ts:76,102`, `lib/generation/jobs.ts` (`getLatestDraftJob`, `getLatestDraftJobOptions`, `getUserJob`, `getFillJobParagraphs`, `syncDraftJobs`), `lib/studio/queries.ts` (draftPrompt 를 읽는 곳 전부)
- Test: 해당 파일의 기존 테스트 또는 `lib/generation/jobs.test.ts`

**Interfaces:**
- Produces: `export const visibleToUser = isNull(draftPrompt.deletedAt)` (`lib/generation/jobs.ts`)
- 바꾸지 않는 곳 (사용량·잠금·속도 제한은 숨긴 행도 셈): `getUserQuota`, `countUserJobsSince`, `isDraftLocked`, `isDraftEditLocked`, `lockingJobExists`, `expireStaleJobs`

- [ ] **Step 1: 실패하는 테스트 작성** — 사용자 화면 조회 함수 하나(`getLatestDraftJobOptions`)가 `deleted_at` 이 있는 최신 행을 건너뛰고 그 이전 행을 돌려주는지. DB 테스트 선례가 없으면 쿼리 조건 생성 부분을 함수로 빼서 확인
- [ ] **Step 2: 실패 확인** — Run: `pnpm test lib/generation` / Expected: FAIL
- [ ] **Step 3: 구현** — 위 사용자 쪽 조회의 where 에 `visibleToUser` 추가. `rg "from\(draftPrompt\)|query\.draftPrompt" lib app components` 로 빠진 곳이 없는지 확인하고, 위 "바꾸지 않는 곳" 목록과 대조
- [ ] **Step 4: 통과 확인** — Run: `pnpm test` / Expected: PASS
- [ ] **Step 5: Commit** — `feat: 어드민이 숨긴 프롬프트 내역을 사용자 화면에서 제외`

---

### Task 7: 어드민 화면 뼈대 (comdraft)

**Files:**
- Create: `app/[lang]/admin/[adminKey]/layout.tsx` (키 재확인 → `forbidden()`, `robots: { index: false, follow: false }`)
- Create: `app/[lang]/admin/[adminKey]/(auth)/login/page.tsx`, `(auth)/password/page.tsx`, `(auth)/layout.tsx` (중앙 폼만)
- Create: `app/[lang]/admin/[adminKey]/(console)/layout.tsx` (헤더 + 사이드 메뉴 + 본문, 푸터 없음), `(console)/page.tsx` (대시보드 자리, Task 8 에서 채움)
- Create: `components/admin/` — `admin-header.tsx`, `admin-profile-menu.tsx`, `admin-sidebar.tsx`, `admin-table.tsx`, `admin-pagination.tsx`, `confirm-action-button.tsx`, `login-form.tsx`, `password-form.tsx`

**Interfaces:**
- Consumes: Task 4 `getAdminSession`, `requireAdmin('view')`, `requireAdminPasswordStep`, 로그인·변경·로그아웃 액션, `adminPath`
- Produces:
  - 사이드 메뉴 항목과 하위 경로: 대시보드 `''`, 사용자 `users`, 게시글 `posts`, 프롬프트 내역 `prompts`, AI 프롬프트 `ai-prompts`, AI 제어 `ai-control`
  - `AdminTable` props: `columns: { key: string; label: ReactNode; className?: string }[]`, `rows: { id: string; cells: Record<string, ReactNode> }[]`, `empty: ReactNode`
  - `AdminPagination` props: `page: number; pageSize: 50; total: number; basePath: string; query: Record<string,string>`
  - `ConfirmActionButton` props: `action: (formData: FormData) => Promise<void>; label; confirmLabel; danger?: boolean; reasonField?: boolean; hidden?: Record<string,string>`
  - 로고 링크는 `localizePath(lang, '/')` (서비스 인덱스)
  - 프로필 메뉴: 아이디, 권한, 비밀번호 변경(콘솔용 `(console)/account/password/page.tsx`, 현재 비밀번호 칸 포함), 로그아웃

- [ ] **Step 1: 화면 작성** — 로그인·변경 화면은 가운데 폼만. 콘솔은 restyle 토큰(`bg-surface`, `text-ink`, `border-line`, `bg-brand` 등)과 lucide 아이콘. 메뉴는 권한과 상관없이 보이고, 조치 버튼만 `canPerform` 으로 숨김
- [ ] **Step 2: 문구 추출** — Run: `pnpm i18n:extract` 후 `locales/en` 의 새 항목을 영어로 채움 / Expected: 빈 번역 없음
- [ ] **Step 3: 동작 확인** — `.env.development` 에 운영자가 `ADMIN_PATH_KEY` 를 넣었는지 확인(없으면 운영자에게 요청). 로컬 DB 에 운영자가 마이그레이션과 테스트 계정을 넣은 뒤, preview_start `comdraft-dev` 로 다음을 확인:
  - `/ko/admin` 403, `/ko/admin/<틀린키>` 403
  - 로그인 → 변경 화면 → 비밀번호 변경 → 콘솔
  - 로고가 서비스 인덱스로 감
  - 로그아웃
- [ ] **Step 4: 전체 검사** — Run: `pnpm eslint && pnpm test` / Expected: 통과
- [ ] **Step 5: Commit** — `feat: 어드민 로그인·비밀번호 변경 화면과 콘솔 레이아웃 추가`

---

### Task 8: 대시보드 통계와 조치 기록 (comdraft)

**Files:**
- Create: `lib/admin/stats-queries.ts`, `lib/admin/stats.ts` (순수 집계), Test: `lib/admin/stats.test.ts`
- Create: `components/admin/refresh-button.tsx` (`router.refresh()` + 마지막으로 읽은 시각)
- Modify: `app/[lang]/admin/[adminKey]/(console)/page.tsx`

**Interfaces:**
- Consumes: `isJobStale` (`lib/generation/job-state.ts`), `getQuotaWeek` (기본 등급 `basic` 의 `quota_plan` 행 기준)
- Produces:
  - `getDashboardStats(now: Date): Promise<DashboardStats>` — 사용자(전체, 이번 주 신규, 밴, 등급별), 게시글(전체, 공개 범위별, 밴, 이번 주 신규), AI(이번 주 작업 수, 비용 합, 모델별 수·비용, 실패 수)
  - `getActiveJobs(now: Date): Promise<ActiveJobRow[]>` — status `queued`·`running`·`awaiting_input`, 사용자 이메일, 모델, 단계, `startedAt`, `createdAt`, `stale: boolean`
  - `getRecentAdminActions(limit: 20)`
  - `summarizeModelUsage(rows: { model: GenerationModel; usedCost: number }[]): { model; jobs; cost }[]`

- [ ] **Step 1: 실패하는 테스트 작성** — `summarizeModelUsage` 가 모델별로 묶고 비용 내림차순, 진행 중 행의 `stale` 이 `isJobStale` 과 같은지
- [ ] **Step 2: 실패 확인** — Run: `pnpm test lib/admin/stats` / Expected: FAIL
- [ ] **Step 3: 구현** — 페이지는 서버에서 한 번 읽음. 자동 갱신·폴링 없음. 새로고침 버튼만 다시 읽음
- [ ] **Step 4: 통과 확인** — Run: `pnpm test lib/admin` / Expected: PASS, 브라우저에서 대시보드 숫자와 새로고침 확인
- [ ] **Step 5: Commit** — `feat: 어드민 대시보드 통계와 진행 중인 AI 작업 목록 추가`

---

### Task 9: 사용자 관리 (comdraft)

**Files:**
- Create: `lib/admin/user-queries.ts`, `lib/actions/admin/users.ts`
- Create: `app/[lang]/admin/[adminKey]/(console)/users/page.tsx`, `users/[userId]/page.tsx`
- Test: `lib/actions/admin/users.test.ts`

**Interfaces:**
- Consumes: `requireAdmin`, `logAdminAction`, `getUserQuota`, `quotaPlan`
- Produces (서버 액션, 모두 `FormData` 를 받음):
  - `banUser` (`user.ban`, 사유 필수 ≤ 500자): `bannedAt=now`, `banReason`, 세션 전부 삭제
  - `unbanUser` (`user.unban`)
  - `revokeUserSessions` (`user.revokeSessions`): 세션 전부 삭제
  - `resetUserUsage` (`user.resetUsage`): `quotaResetAt=now`
  - `changeUserPlan` (`user.changePlan`): `role` 이 `quota_plan.role` 에 있어야 함, 사용량은 건드리지 않음
  - 목록 쿼리: `listUsers({ q, page }): { rows, total }` (이메일·GitHub 아이디 ilike, 50개), 각 행에 이번 주 사용률
  - 상세: 기본 정보, `getUserQuota`, 최근 작업 20개(숨긴 것 포함, 표시), 게시글 수, 관련 조치 기록

- [ ] **Step 1: 실패하는 테스트 작성** — `changeUserPlan` 이 없는 등급을 거부, viewer 가 `banUser` 를 부르면 거부(Task 4 의 `requireAdmin` 을 실제로 거치게), 사유 없는 밴 거부
- [ ] **Step 2: 실패 확인** — Run: `pnpm test lib/actions/admin` / Expected: FAIL
- [ ] **Step 3: 구현** — 각 액션은 성공 후 `logAdminAction` 과 해당 페이지 `revalidatePath`. 밴·세션 무효화·초기화는 `ConfirmActionButton`
- [ ] **Step 4: 통과 확인** — Run: `pnpm test` / Expected: PASS, 브라우저에서 밴된 테스트 사용자가 로그인 못 하고 작성 요청이 거부되는지 확인
- [ ] **Step 5: Commit** — `feat: 어드민 사용자 목록·상세와 밴·세션 무효화·사용량 초기화·플랜 변경 추가`

---

### Task 10: 게시글과 프롬프트 내역 관리 (comdraft)

**Files:**
- Create: `lib/admin/post-queries.ts`, `lib/actions/admin/posts.ts`, `lib/admin/prompt-history-queries.ts`, `lib/actions/admin/prompt-history.ts`
- Create: `app/[lang]/admin/[adminKey]/(console)/posts/page.tsx`, `posts/[postId]/page.tsx` (게시글 정보와 관련 조치 기록), `prompts/page.tsx`, `prompts/[jobId]/page.tsx`
- Test: `lib/actions/admin/posts.test.ts`, `lib/actions/admin/prompt-history.test.ts`

**Interfaces:**
- Consumes: `applyModeration` (`lib/posts/moderation-queries.ts`), `revalidateSitemap`, `isJobActive`
- Produces:
  - `banPost` / `unbanPost` (`post.ban`/`post.unban`): `applyModeration` 재사용 + `revalidateSitemap()`
  - `deletePost` (`post.delete`): 한 트랜잭션에서 게시글 행 삭제, 원래 초안 `status='draft'`, 이후 `revalidateSitemap()`
  - `deletePromptHistory` (`history.delete`): 진행 중(`isJobActive` 또는 `awaiting_input`)이면 거부, 아니면 `deletedAt=now`
  - 목록: 게시글(제목·작성자 검색, 공개 범위, 언어, 게시일, 조회 수, 밴), 프롬프트 내역(사용자, 초안, 요청 문구 앞 80자, 모델, 상태, 비용, 만든 시각, 숨김 여부)
  - 상세: 요청 문구, 옵션, 커밋 SHA, 참고 링크, 오류 코드, 사용 토큰·비용

- [ ] **Step 1: 실패하는 테스트 작성** — 진행 중 작업 삭제 거부(Review Focus 5), editor 의 `deletePost` 거부, `deletePromptHistory` 가 행을 지우지 않고 `deletedAt` 만 채움
- [ ] **Step 2: 실패 확인** — Run: `pnpm test lib/actions/admin` / Expected: FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — Run: `pnpm test` / Expected: PASS, 브라우저에서 숨긴 내역이 사용자 저장소 설정·스튜디오에서 사라지고 이번 주 사용량은 그대로인지 확인
- [ ] **Step 5: Commit** — `feat: 어드민 게시글 밴·삭제와 프롬프트 내역 조회·숨김 추가`

---

### Task 11: Lambda 작업 시작 검사와 사용량 구간 (comdraft-lambda)

**Files:**
- Modify: `src/contract.ts` (오류 코드 `service_paused`, `user_banned`, comdraft 와 같은 순서), `src/jobs.ts` (`JobStore` 에 `checkAdmission`, `reserveQuota` 의 사용량 쿼리), `src/quota.ts`, `src/run-job.ts`
- Test: `src/quota.test.ts`, `src/run-job.test.ts`

**Interfaces:**
- Produces:
  - `getUsageWindowStart(weekStart: Date, quotaResetAt: Date | null): Date` (comdraft Task 5 와 같은 규칙)
  - `JobStore.checkAdmission(jobId: string): Promise<'ok' | 'service_paused' | 'user_banned'>` — `service_setting` 의 `ai_generation.paused` 와 작업 주인의 `banned_at` 을 한 쿼리로
  - `runJob`: `markRunning` 이 성공한 직후 `checkAdmission` 이 `ok` 가 아니면 `jobs.fail(jobId, <그 코드>)` 후 종료 (Claude 호출 없음)
  - `reserveQuota` 예약 쿼리: `user.quota_reset_at` 을 함께 읽고 `p.created_at >= getUsageWindowStart(week.start, resetAt)`

- [ ] **Step 1: 브랜치** — Run: `git -C /Users/junmyeongjo/Workspace/comdraft-lambda switch -c feat/admin-controls main`
- [ ] **Step 2: 실패하는 테스트 작성**

```ts
it('AI 중지면 Claude 를 부르지 않고 service_paused 로 실패', async () => {
  const jobs = fakeJobStore({ admission: 'service_paused' });
  const outcome = await runJob('job-1', { jobs, llm: failingLlm, ... });
  assert.equal(jobs.failedWith, 'service_paused');
  assert.equal(llmCalls, 0);
});
it('사용량은 초기화 시점 이후만', () =>
  assert.deepEqual(getUsageWindowStart(new Date('2026-11-15T15:00:00Z'), new Date('2026-11-18T03:00:00Z')),
    new Date('2026-11-18T03:00:00Z')));
```

- [ ] **Step 3: 실패 확인** — Run: `pnpm test` / Expected: 새 테스트 FAIL
- [ ] **Step 4: 구현**
- [ ] **Step 5: 통과 확인** — Run: `pnpm typecheck && pnpm test` / Expected: PASS
- [ ] **Step 6: Commit** — `feat: AI 중지·사용자 밴 시 작업 시작 거부와 사용량 초기화 반영`

---

### Task 12: 프롬프트 기본값 목록과 올리기 (comdraft-lambda)

**Files:**
- Create: `src/prompts/editable.ts`, Test: `src/prompts/editable.test.ts`
- Create: `src/prompt-defaults.ts` (DB 올리기), Test: `src/prompt-defaults.test.ts`
- Modify: `src/handler.ts` (콜드 스타트에 한 번)

**Interfaces:**
- Produces:
  - `EDITABLE_PROMPT_KEYS`: `plan.system`, `analyze.system`, `write.system`, `review.system`, `revise.system`, `fill.system`, `tone.<TONES>`, `postType.<POST_TYPES>`, `length.<LENGTHS>.target`, `requiredBlocks.<REQUIRED_BLOCKS>`
  - `readEditableText(pack: PromptPack, key: EditablePromptKey): string`
  - `writeEditableText(pack: PromptPack, key: EditablePromptKey, text: string): PromptPack` (원본을 바꾸지 않고 새 묶음)
  - `requiredMarkersOf(text: string, pack: PromptPack): string[]` — 문장에 들어 있는 것만: 묶음의 규칙 마커 4개(`dataRuleMarker` 등), `FILL_TARGET_MARKER`, `/<\/?([a-z][a-z_-]*)>/g` 로 찾은 태그 이름(`<tag>` 형태 그대로), 중복 제거·정렬
  - `buildDefaultRows(): { locale; key; content; requiredMarkers }[]`, `defaultsVersion(rows): string` (행을 정렬한 JSON 의 SHA-256)
  - `publishPromptDefaults(sql: Database): Promise<'unchanged' | 'published'>` — `ai_prompt_default` 에 다른 version 이 하나라도 있거나 행 수가 다르면 한 트랜잭션으로 전체 교체
  - handler: 모듈 수준에서 한 번만 시작하고 실패해도 작업은 계속 (실패는 무시하고 다음 콜드 스타트에 다시)

- [ ] **Step 1: 실패하는 테스트 작성** — 모든 키에 대해 `readEditableText` 가 빈 문자열이 아님(ko·en), `writeEditableText` 후 다시 읽으면 바뀐 값이고 원본은 그대로, `fill.system` 의 필수 문자열에 `FILL_TARGET_MARKER` 가 들어감, 같은 기본값이면 `defaultsVersion` 이 같음
- [ ] **Step 2: 실패 확인** — Run: `pnpm test` / Expected: FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — Run: `pnpm typecheck && pnpm test` / Expected: PASS
- [ ] **Step 5: Commit** — `feat: 수정 가능한 프롬프트 키와 기본값 올리기 추가`

---

### Task 13: 프롬프트 수정본 반영 (comdraft-lambda)

**Files:**
- Create: `src/prompts/overrides.ts`, Test: `src/prompts/overrides.test.ts`
- Modify: `src/prompts/index.ts` (`getPromptPack(locale, overrides?)`), `src/jobs.ts` (`JobStore.loadPromptOverrides(locale)`), `src/run-job.ts`·`src/pipeline.ts`·`src/fill.ts` (작업마다 한 번 읽은 묶음을 넘김)

**Interfaces:**
- Consumes: Task 12 `writeEditableText`, `requiredMarkersOf`, `readEditableText`
- Produces:
  - `applyOverrides(pack: PromptPack, overrides: { key: string; content: string }[]): { pack: PromptPack; rejected: string[] }` — 모르는 키는 무시, 기본값의 필수 문자열이 하나라도 빠진 수정본은 `rejected` 에 넣고 기본값 유지
  - `JobStore.loadPromptOverrides(locale: JobLocale): Promise<{ key: string; content: string }[]>`
  - `rejected` 가 있으면 작업 로그에 키 이름만 남김 (문장 내용은 남기지 않음)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('수정본이 기본값을 덮어씀', () => {
  const { pack } = applyOverrides(ko, [{ key: 'tone.plain', content: '짧고 담백하게.' }]);
  assert.equal(pack.tone.plain, '짧고 담백하게.');
});
it('마커를 잃은 system 수정본은 기본값을 씀', () => {
  const { pack, rejected } = applyOverrides(ko, [{ key: 'write.system', content: '아무 규칙 없음' }]);
  assert.equal(pack.write.system, ko.write.system);
  assert.deepEqual(rejected, ['write.system']);
});
it('다른 로케일 수정본은 섞이지 않음', ...); // en 작업은 en 수정본만 읽음 (loadPromptOverrides 의 쿼리 조건)
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm test` / Expected: FAIL
- [ ] **Step 3: 구현** — `getPromptPack` 을 직접 부르던 5곳(`pipeline.ts`)과 `fill.ts` 가 작업 시작 때 만든 묶음 하나를 쓰도록
- [ ] **Step 4: 통과 확인** — Run: `pnpm typecheck && pnpm test && pnpm build` / Expected: PASS, smoke 통과
- [ ] **Step 5: Commit** — `feat: 어드민 프롬프트 수정본을 작업마다 반영`

---

### Task 14: AI 프롬프트 편집과 AI 제어 화면 (comdraft)

**Files:**
- Create: `lib/admin/prompt-validation.ts`, Test: `lib/admin/prompt-validation.test.ts`
- Create: `lib/admin/ai-prompt-queries.ts`, `lib/actions/admin/ai-prompts.ts`, `lib/actions/admin/ai-control.ts`
- Create: `app/[lang]/admin/[adminKey]/(console)/ai-prompts/page.tsx`, `ai-prompts/[locale]/[key]/page.tsx`, `ai-control/page.tsx`
- Test: `lib/actions/admin/ai-control.test.ts`

**Interfaces:**
- Consumes: `aiPromptDefault`(Lambda 가 올린 행), `getAiGenerationSetting`
- Produces:
  - `validatePromptOverride(content: string, requiredMarkers: string[]): { ok: true } | { ok: false; reason: 'empty' | 'too_long' | 'missing_markers'; missing?: string[] }` (최대 20,000자)
  - `savePromptOverride` (`prompt.edit`): 검사 통과 시 `ai_prompt` upsert, 이전 값(없으면 null)을 `ai_prompt_revision` 에
  - `resetPromptOverride` (`prompt.edit`): 이전 값을 이력에 남기고 `ai_prompt` 행 삭제
  - `restorePromptRevision` (`prompt.edit`): 이력의 값으로 저장(같은 검사)
  - `pauseAiGeneration` (`ai.pause`, 사유 필수), `resumeAiGeneration` (`ai.resume`): `service_setting` upsert
  - 목록: `ai_prompt_default` 의 모든 키, 로케일별 "기본값 / 수정됨", 마지막 수정자·시각. 기본값 행이 하나도 없으면 "Lambda 가 아직 기본값을 올리지 않았어요" 안내
  - 편집: 기본 문장(읽기 전용)과 수정 문장을 나란히, 필수 문자열 목록 표시, 이력 목록과 다시 적용

- [ ] **Step 1: 실패하는 테스트 작성** — 빈 문장·20,001자·필수 문자열 누락(누락 목록 포함) 거부, editor 의 `pauseAiGeneration` 거부, admin 이 중지하면 `getAiGenerationSetting().paused === true`
- [ ] **Step 2: 실패 확인** — Run: `pnpm test lib/admin lib/actions/admin` / Expected: FAIL
- [ ] **Step 3: 구현** — 중지·재개는 `ConfirmActionButton`
- [ ] **Step 4: 통과 확인** — Run: `pnpm i18n:extract && pnpm eslint && pnpm test && pnpm build` / Expected: 전부 통과. 브라우저에서 중지 후 스튜디오 작성 요청이 "잠시 멈췄어요" 로 거부되는지, 재개 후 다시 되는지 확인
- [ ] **Step 5: Commit** — `feat: 어드민 AI 프롬프트 편집·이력과 AI 작성 중지·재개 추가`

---

### Task 15: 문서와 마무리 (두 저장소)

**Files:**
- Modify: comdraft `README.md` (환경 변수 표에 `ADMIN_PATH_KEY`, 관련 문서에 설계 문서 링크), `docs/admin-console-operations.md` (배포 순서 최종본)
- Modify: comdraft-lambda `README.md` (DB 읽기 대상에 `service_setting`·`ai_prompt`, 쓰기 대상 `ai_prompt_default`, 배포 순서)

- [ ] **Step 1: 문서 갱신** — 환경 변수 값은 적지 않고 이름과 형식만
- [ ] **Step 2: 전체 검사** — comdraft: `pnpm eslint && pnpm test && pnpm build`, lambda: `pnpm typecheck && pnpm test && pnpm build` / Expected: 모두 통과
- [ ] **Step 3: Commit** (각 저장소) — `docs: 어드민 콘솔 환경 변수와 운영 순서 정리`
