# 주간 토큰 할당량 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자 등급별 주간 토큰 할당량(`quota_plan` 테이블)으로 AI 작성 사용량을 제한하고, 거부·소진을 화면에 안내한다.

**Architecture:**
- 정책 값(한도, 초과 비율, 초기화 시간대·요일·시각)은 `comdraft.quota_plan` 행에 두고, Next.js 와 Lambda 가 같은 행을 읽는다.
- 사용량은 작업(`draft_prompt`)별 `estimated_tokens`, `used_tokens` 의 주간 합계로 계산한다. 따로 초기화하는 작업은 없다.
- 검사는 두 번 한다. Next.js 는 요청할 때 소진 여부만 보고, Lambda 는 커밋 준비 후 Claude 호출 전에 예상량을 보고 사용자 단위 잠금을 걸어 판정한다.

**Tech Stack:**
- comdraft: Next.js 16, Drizzle (postgres-js), Lingui, Vitest, dayjs
- comdraft-lambda: Node 22 TypeScript, postgres, node:test, dayjs (새 의존성), esbuild

**Spec:** `docs/superpowers/specs/2026-11-10-weekly-token-quota-design.md`

## Global Constraints

- 작업 위치는 브랜치 두 개다. worktree 는 쓰지 않는다.
  - comdraft: `/Users/junmyeongjo/Workspace/comdraft` 의 `feat/weekly-token-quota`
  - comdraft-lambda: `/Users/junmyeongjo/Workspace/comdraft-lambda` 에서 만드는 `feat/weekly-token-quota`
- pnpm 은 두 저장소 모두 `/Users/junmyeongjo/Library/pnpm/pnpm` (10.33) 만 쓴다. node_modules 가 pnpm 10 으로 설치돼 있고, nvm 의 pnpm 11 은 쓰지 않는다.
- comdraft 검증 명령: `./node_modules/.bin/vitest run`, `./node_modules/.bin/tsc --noEmit`, `./node_modules/.bin/eslint . --ext .ts,.tsx,.js,.jsx`.
- comdraft-lambda 검증 명령: `/Users/junmyeongjo/Library/pnpm/pnpm test`, `/Users/junmyeongjo/Library/pnpm/pnpm typecheck`, `/Users/junmyeongjo/Library/pnpm/pnpm build`.
- 마이그레이션 적용은 컨트롤러가 한다 (Task 1 끝). 사용자가 로컬과 운영 적용을 허락했다. 구현자는 `db:migrate*` 를 실행하지 않는다.
- 한도와 비율 같은 정책 값은 코드에 상수로 두지 않는다. 항상 `QuotaPlan` 인자로 받는다. 초기값은 마이그레이션의 INSERT 에만 있다.
  - basic: 100000 / pro: 500000 / max: 2000000
  - 공통: 비율 1.30, `Asia/Seoul`, 요일 0, 시각 0
- 사용량 = `input_tokens + output_tokens + cache_creation_input_tokens + cache_read_input_tokens`. 없는 항목은 0 으로 센다.
- `isWithinAllowance`: `remaining > 0 && estimate <= remaining * overrunRatio`.
- `getJobUsage` 규칙:

  | 작업 상태 | 사용량 |
  |---|---|
  | `queued` / `running` | `max(estimated ?? 0, used)` |
  | `failed` + `quota_exceeded` | 0 |
  | 그 밖 | `used` |

- 작업은 `created_at` 이 속한 주에 들어간다. 주 시작은 그 시각 이전(포함)의 가장 가까운 `resetWeekday` 요일 `resetHour` 시이고, 시간대는 `resetTimezone` 기준이다. `resetsAt` 은 주 시작에서 7일 뒤다.
- 화면 문구는 Lingui 로 쓴다. 영문 번역을 채우고 `pnpm i18n:extract`, `pnpm i18n:compile` 을 실행한다.
  - 요청 시 거부: "이번 주 사용 가능한 양을 모두 사용했습니다. {resetsAt}에 초기화됩니다."
  - Lambda 거부: "이번 요청은 남은 사용량보다 커서 진행하지 않았습니다. 사용량은 차감되지 않았습니다. 커밋 수나 길이를 줄이거나 {resetsAt} 이후에 다시 시도해 주세요."
  - 정책 없음: "사용량 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."
- 초기화 시각 표기:
  - ko: "11월 15일(일) 0시"
  - en: "Sun, Nov 15, 12:00 AM (KST)" (시간대 약어는 `Intl` 결과를 쓴다)
- 디버그 `console` 을 남기지 않는다. 주석은 주변 코드처럼 한국어로 쓴다.
- 커밋 형식: 한국어 제목, 빈 줄, `- ` 본문, 빈 줄, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **주 경계와 시간대**: 서버 시간대(UTC)와 상관없이 서울 일요일 0시에 넘어가야 한다. 토요일 23:59:59 KST 요청은 지난주로 센다. Task 2 와 Task 5 의 경계 테스트가 맡는다.
2. **같은 사용자의 동시 요청 두 개**: 둘 다 Lambda 검사를 통과해 한도를 크게 넘으면 안 된다. 예상량 기록과 검사를 advisory lock 트랜잭션 하나로 묶는다 (Task 5). 컨트롤러가 SQL 로 확인한다 (Task 7).
3. **중간 실패한 작업**: 이미 쓴 토큰은 남아야 하고, `quota_exceeded` 로 거부된 작업은 0 이어야 한다. Task 6 의 runJob 테스트가 맡는다.
4. **정책 행이 없는 등급**: 서버 오류(500)가 아니라 정해진 거부가 나와야 한다. Task 3 은 `quota_unavailable`, Task 5 는 `internal` 로 처리한다.
5. **남은 양이 음수**: 화면에 음수가 나오면 안 되고, 다음 요청은 바로 거부돼야 한다. Task 2 의 `summarizeQuota` 와 Task 4 의 표시가 맡는다.

---

### Task 1: quota_plan 테이블, user.role, 작업 사용량 컬럼

**Files:**
- Create: `lib/db/schema/quota.ts`
- Modify: `lib/db/schema/index.ts`, `lib/db/schema/auth.ts:20-33`, `lib/db/schema/draft.ts:84-140`, `lib/auth/index.ts:57-66`
- Create (generated + edited): `drizzle/0014_*.sql`, `drizzle/meta/*`

**Interfaces:**
- Produces:
  - `quotaPlan` 테이블 (`role` PK text, `weeklyTokenLimit` integer, `overrunRatio` numeric(4,2) — Drizzle `numeric({ precision: 4, scale: 2, mode: 'number' })`, `resetTimezone` text, `resetWeekday` smallint, `resetHour` smallint, `updatedAt` timestamptz(3)).
    - check 제약: `quota_plan_limit_check`(> 0), `quota_plan_ratio_check`(>= 1), `quota_plan_weekday_check`(0..6), `quota_plan_hour_check`(0..23).
  - `type QuotaPlanRow = typeof quotaPlan.$inferSelect`
  - `user.role` text not null default `'basic'`. 외래 키 `user_role_quota_plan_fk` 가 `quota_plan.role` 을 참조한다 (`onUpdate: 'cascade'`, `onDelete: 'restrict'`).
  - `draftPrompt.estimatedTokens` integer (null 허용), `draftPrompt.usedTokens` integer not null default 0, `draftPrompt.referenceUrls` jsonb `$type<string[]>()` not null default `[]`
  - Better Auth `user.additionalFields.role`: `{ type: 'string', required: false, input: false }`

- [ ] **Step 1: 스키마 작성** (위 Interfaces 그대로, 기존 스키마 파일의 주석·스타일을 따름)
- [ ] **Step 2: 마이그레이션 생성** — Run: `/Users/junmyeongjo/Library/pnpm/pnpm db:generate`. 만들어진 `0014_*.sql` 을 수정한다.
  - `CREATE TABLE "comdraft"."quota_plan"` 바로 뒤에 INSERT 세 줄을 넣는다.
    ```sql
    INSERT INTO "comdraft"."quota_plan" ("role","weekly_token_limit","overrun_ratio","reset_timezone","reset_weekday","reset_hour") VALUES
      ('basic', 100000, 1.30, 'Asia/Seoul', 0, 0),
      ('pro', 500000, 1.30, 'Asia/Seoul', 0, 0),
      ('max', 2000000, 1.30, 'Asia/Seoul', 0, 0);--> statement-breakpoint
    ```
  - `user.role` 의 ADD COLUMN 과 외래 키는 그 INSERT 뒤에 오도록 순서를 맞춘다.
  - 기존 user 행은 default `'basic'` 으로 채워지므로 외래 키가 통과한다.
- [ ] **Step 3: 확인** — 아래가 모두 통과해야 한다.
  - Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint . --ext .ts,.tsx,.js,.jsx && ./node_modules/.bin/vitest run`
  - SQL 에 `quota_plan` 생성, INSERT, check 4개, `user.role` 과 외래 키, `draft_prompt` 세 컬럼만 있다.
- [ ] **Step 4: 커밋** — `feat: 할당량 정책 테이블과 사용자 등급, 작업 사용량 컬럼`
- [ ] **Step 5 (컨트롤러): 마이그레이션 적용**
  - `/Users/junmyeongjo/Library/pnpm/pnpm db:migrate:local` 를 실행한다.
  - `/Users/junmyeongjo/Library/pnpm/pnpm db:migrate:prod` 를 실행한다.
  - 양쪽에서 `select * from comdraft.quota_plan` 이 세 행인지 확인한다.
  - 운영 관리자 계정을 max 로 올린다. 대상 계정은 사용자에게 확인한 이메일이다.

---

### Task 2: 할당량 규칙 순수 함수 (comdraft)

**Files:**
- Create: `lib/generation/quota.ts`, `lib/generation/quota.test.ts`

**Interfaces:**
- Consumes: 없음 (dayjs 와 `utc`, `timezone` 플러그인. 이미 의존성에 있음)
- Produces:
  - `interface QuotaPlan { role: string; weeklyTokenLimit: number; overrunRatio: number; resetTimezone: string; resetWeekday: number; resetHour: number }`
  - `interface QuotaJob { status: DraftPromptStatus; estimatedTokens: number | null; usedTokens: number; errorCode: string | null }`
  - `interface QuotaSummary { role: string; limit: number; used: number; remaining: number; resetsAt: Date }`
  - `getQuotaWeek(now: Date, plan: QuotaPlan): { start: Date; resetsAt: Date }`
  - `isWithinAllowance(estimate: number, remaining: number, plan: QuotaPlan): boolean`
  - `getJobUsage(job: QuotaJob): number`
  - `summarizeQuota(plan: QuotaPlan, jobs: QuotaJob[], now: Date): QuotaSummary` (`remaining` 은 음수 가능)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const seoul: QuotaPlan = { role: 'basic', weeklyTokenLimit: 100_000, overrunRatio: 1.3, resetTimezone: 'Asia/Seoul', resetWeekday: 0, resetHour: 0 };
it('토 23:59:59 KST 는 지난 일요일 주', () => {
  expect(getQuotaWeek(new Date('2026-11-14T14:59:59Z'), seoul)).toEqual({ start: new Date('2026-11-07T15:00:00Z'), resetsAt: new Date('2026-11-14T15:00:00Z') });
});
it('일 00:00 KST 는 그 시각이 주 시작', () => {
  expect(getQuotaWeek(new Date('2026-11-14T15:00:00Z'), seoul)).toEqual({ start: new Date('2026-11-14T15:00:00Z'), resetsAt: new Date('2026-11-21T15:00:00Z') });
});
it('다른 정책: UTC 월요일 9시', () => {
  const plan = { ...seoul, resetTimezone: 'UTC', resetWeekday: 1, resetHour: 9 };
  expect(getQuotaWeek(new Date('2026-11-16T08:59:59Z'), plan).start).toEqual(new Date('2026-11-09T09:00:00Z'));
  expect(getQuotaWeek(new Date('2026-11-16T09:00:00Z'), plan).start).toEqual(new Date('2026-11-16T09:00:00Z'));
});
it('남은 양의 1.3배까지 허용', () => {
  expect(isWithinAllowance(26_000, 20_000, seoul)).toBe(true);
  expect(isWithinAllowance(26_001, 20_000, seoul)).toBe(false);
  expect(isWithinAllowance(1, 0, seoul)).toBe(false);
  expect(isWithinAllowance(1, -5, seoul)).toBe(false);
});
it('작업별 사용량 규칙', () => {
  expect(getJobUsage({ status: 'running', estimatedTokens: 50_000, usedTokens: 12_000, errorCode: null })).toBe(50_000);
  expect(getJobUsage({ status: 'running', estimatedTokens: 50_000, usedTokens: 61_000, errorCode: null })).toBe(61_000);
  expect(getJobUsage({ status: 'queued', estimatedTokens: null, usedTokens: 0, errorCode: null })).toBe(0);
  expect(getJobUsage({ status: 'completed', estimatedTokens: 50_000, usedTokens: 42_000, errorCode: null })).toBe(42_000);
  expect(getJobUsage({ status: 'failed', estimatedTokens: 90_000, usedTokens: 0, errorCode: 'quota_exceeded' })).toBe(0);
  expect(getJobUsage({ status: 'failed', estimatedTokens: 50_000, usedTokens: 7_000, errorCode: 'llm_failed' })).toBe(7_000);
});
it('요약: 남은 양 음수 허용', () => {
  const summary = summarizeQuota(seoul, [{ status: 'completed', estimatedTokens: 0, usedTokens: 120_000, errorCode: null }], new Date('2026-11-12T00:00:00Z'));
  expect(summary).toMatchObject({ role: 'basic', limit: 100_000, used: 120_000, remaining: -20_000 });
  expect(summary.resetsAt).toEqual(new Date('2026-11-14T15:00:00Z'));
});
```

- [ ] **Step 2: 실패 확인** — Run: `./node_modules/.bin/vitest run lib/generation/quota.test.ts` / Expected: FAIL (모듈 없음)
- [ ] **Step 3: 구현** — dayjs 에 `utc`, `timezone` 플러그인을 확장한다.
  - `dayjs(now).tz(plan.resetTimezone)` 로 그 시간대의 시각을 구한다.
  - 같은 날 `resetHour` 시로 맞춘 뒤, 요일 차이 `(day - resetWeekday + 7) % 7` 만큼 뺀다.
  - 결과가 now 보다 뒤면 7일 더 뺀다.
  - `resetsAt` 은 그 시간대에서 `.add(7, 'day')` 로 구한다.
  - 모듈은 server-only 와 Lingui 를 import 하지 않는다.
- [ ] **Step 4: 통과 확인** — Run: 같은 명령 / Expected: PASS
- [ ] **Step 5: 커밋** — `feat: 주간 할당량 계산 규칙`

---

### Task 3: 요청 검사, 참고 링크 기록, 상태 조회의 할당량 (comdraft 서버)

**Files:**
- Create: `lib/generation/quota-queries.ts`
- Modify: `lib/generation/contract.ts:36-52` (`quota_exceeded`), `lib/generation/jobs.ts` (`createJob` 이 `referenceUrls` 저장), `lib/actions/generation.ts:48-62,171-240` (요청 검사), `lib/actions/generation.ts` `getGenerationStatus` (quota 반환)
- Test: `lib/generation/quota-queries.test.ts` 는 만들지 않는다 (DB 조회). 대신 Step 1 의 순수 helper 를 테스트한다.

**Interfaces:**
- Consumes: Task 1 `quotaPlan`, `user.role`, `draftPrompt` 컬럼; Task 2 `QuotaPlan`, `QuotaJob`, `summarizeQuota`, `getQuotaWeek`
- Produces:
  - `toQuotaPlan(row: QuotaPlanRow): QuotaPlan` (`lib/generation/quota.ts` 에 추가, numeric → number)
  - `getUserQuota(userId: string, now?: Date): Promise<QuotaSummary | null>` (server-only)
    - 등급 행이 없으면 null.
    - 작업은 `draft.userId = userId` 이고 `draftPrompt.createdAt >= week.start` 인 것만 센다.
  - `RequestDraftGenerationResult` 에 `{ status: 'quota_exhausted'; resetsAt: string }`(ISO) 와 `{ status: 'quota_unavailable' }` 추가
  - `GenerationErrorCode` 에 `'quota_exceeded'`
  - `GenerationStatusResult` 의 ok 에 `quota: { remaining: number; resetsAt: string } | null`. 종료된 작업(completed, failed)일 때만 채우고, 진행 중이면 null.

- [ ] **Step 1: 실패하는 테스트 작성** (`lib/generation/quota.test.ts` 에 추가)

```ts
it('toQuotaPlan 은 numeric 문자열 비율도 숫자로', () => {
  expect(toQuotaPlan({ role: 'pro', weeklyTokenLimit: 500_000, overrunRatio: '1.30' as unknown as number, resetTimezone: 'Asia/Seoul', resetWeekday: 0, resetHour: 0, updatedAt: new Date() }).overrunRatio).toBe(1.3);
});
```

- [ ] **Step 2: 실패 확인** — Run: `./node_modules/.bin/vitest run lib/generation/quota.test.ts` / Expected: FAIL
- [ ] **Step 3: 구현**
  - `getUserQuota`: `user` 와 `quotaPlan` 을 role 로 inner join 해 정책을 읽는다. 작업은 `draftPrompt` 와 `draft` 를 조인해 이번 주 것만 고르고, `QuotaJob` 필드만 select 한다.
  - `requestDraftGeneration`: 시간당 제한 다음, GitHub 토큰 조회 전에 검사한다.
    - `getUserQuota` 가 null → `quota_unavailable`
    - `remaining <= 0` → `quota_exhausted` 와 `resetsAt.toISOString()`
  - `createJob`: 요청한 초안의 참고 링크 주소(추가 순)를 `referenceUrls` 로 저장한다. 새 초안은 `[]`.
  - `getGenerationStatus`: 종료된 작업이면 `getUserQuota` 로 `quota` 를 채운다. 정책이 없으면 null.
- [ ] **Step 4: 확인** — Run: `./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint . --ext .ts,.tsx,.js,.jsx` / Expected: 통과
- [ ] **Step 5: 커밋** — `feat: 작성 요청 할당량 검사와 참고 링크 기록`

---

### Task 4: 거부·소진 안내와 가짜 실행기 사용량 (comdraft 화면)

**Files:**
- Create: `lib/generation/quota-format.ts`, `lib/generation/quota-format.test.ts`
- Modify: `components/studio/prompt-composer.tsx:36-60` (notice 두 개), `components/studio/generation-progress.tsx:22-80` (`quota_exceeded` 문구에 초기화 시각), 완료 후 안내를 띄울 곳 (`components/studio/draft-editor.tsx` 또는 생성 상태 훅 `hooks/use-generation-job.ts` 중 상태를 가진 곳), `lib/generation/fake-runner.ts:136-206`, `locales/*`

**Interfaces:**
- Consumes: Task 3 의 결과 타입 (`quota_exhausted.resetsAt`, `GenerationStatusResult.quota`, `quota_exceeded`)
- Produces:
  - `formatQuotaReset(resetsAt: Date, locale: Locale): string` (macro 없는 순수 함수)
  - 가짜 실행기는 완료할 때 `usedTokens` 30_000 을 기록한다 (`FAKE_USED_TOKENS` 상수)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('ko', () => {
  expect(formatQuotaReset(new Date('2026-11-15T15:00:00Z'), 'ko')).toBe('11월 16일(월) 0시');
});
it('en', () => {
  expect(formatQuotaReset(new Date('2026-11-14T15:00:00Z'), 'en')).toBe('Sun, Nov 15, 12:00 AM (GMT+9)');
});
```

  - en 의 시간대 표기는 이 Node 의 `Intl` 결과(`GMT+9` 또는 `KST`)에 맞춘다. 실제 출력을 보고 기대값을 정한다.
  - 시간대는 항상 `Asia/Seoul` 이다.

- [ ] **Step 2: 실패 확인** — Run: `./node_modules/.bin/vitest run lib/generation/quota-format.test.ts` / Expected: FAIL
- [ ] **Step 3: 구현**
  - `formatQuotaReset`: `Intl.DateTimeFormat` 에 `timeZone: 'Asia/Seoul'` 을 준다. ko 는 월·일·요일(짧게)·시를 조합해 "M월 D일(요일) H시" 형식으로 만든다.
  - 입력창 notice
    - `quota_exhausted`: 문구에 `formatQuotaReset(new Date(result.resetsAt), locale)` 를 넣는다.
    - `quota_unavailable`: Global Constraints 의 문구.
  - 진행 표시의 `quota_exceeded` 문구: 상태 조회의 `quota.resetsAt` 으로 초기화 시각을 넣는다. 값이 없으면 시각 없이 "다음 초기화 이후".
  - 완료 후 안내: 상태 조회가 `status: 'completed'` 와 `quota.remaining <= 0` 을 주면 편집기 위에 안내를 띄운다. 기존 안내 영역이나 진행 표시 자리를 재사용하고, 닫기 버튼을 둔다.
  - 가짜 실행기: `completeJob` 할 때 `usedTokens: FAKE_USED_TOKENS` 를 기록한다. 기존 완료 UPDATE 에 함께 넣는다.
  - 문구 카탈로그: extract, en 번역, compile 을 한다.
- [ ] **Step 4: 확인** — Run: `./node_modules/.bin/vitest run && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/eslint . --ext .ts,.tsx,.js,.jsx` / Expected: 통과
- [ ] **Step 5: 커밋** — `feat: 할당량 거부와 소진 안내`
- [ ] **Step 6 (컨트롤러): 로컬 브라우저 확인**
  - basic 계정에서 가짜 실행기로 네 번째 요청을 보내면, 완료 후 소진 안내가 뜬다 (30k × 4 = 120k ≥ 100k).
  - 그다음 요청은 입력창에 거부 안내가 뜬다.

---

### Task 5: Lambda 할당량 규칙과 작업 저장소 (comdraft-lambda)

**Files:**
- Create: `src/quota.ts`, `src/quota.test.ts`
- Modify: `package.json` (`dayjs` 추가, comdraft 와 같은 버전 `1.11.23` 이상), `src/contract.ts` (`quota_exceeded`), `src/jobs.ts` (`reserveQuota`, `addUsage`, `loadContext` 의 `referenceUrls` 를 `draft_prompt.reference_urls` 에서 읽기)

**Interfaces:**
- Produces:
  - `src/quota.ts`: Task 2 와 같은 `QuotaPlan`, `QuotaJob`, `getQuotaWeek`, `isWithinAllowance`, `getJobUsage`. 로직과 테스트 값이 같다.
  - `JobStore.reserveQuota(jobId: string, estimate: number, now: Date): Promise<'reserved' | 'exceeded' | 'no_plan'>`
    - 트랜잭션에서 `select pg_advisory_xact_lock(hashtext(<user_id>))` 를 건다.
    - 작업 → 초안 → 사용자 → `quota_plan` 을 조인해 정책을 읽고, 이번 주 다른 작업들의 사용량을 합한다 (이 작업 제외).
    - `isWithinAllowance` 를 통과하면 `estimated_tokens` 를 기록하고 `'reserved'`, 못 하면 `estimated_tokens` 만 기록하고 `'exceeded'` 를 돌려준다.
    - 정책 행이 없으면 `'no_plan'`.
  - `JobStore.addUsage(jobId: string, tokens: number): Promise<void>`: `used_tokens = used_tokens + tokens`. 0 이하는 무시한다.

- [ ] **Step 1: 실패하는 테스트 작성** — `src/quota.test.ts` 에 Task 2 Step 1 과 같은 경계·허용·사용량 케이스를 넣는다. `node:test` 와 `assert` 로 옮긴다.
- [ ] **Step 2: 실패 확인** — Run: `/Users/junmyeongjo/Library/pnpm/pnpm test` / Expected: FAIL
- [ ] **Step 3: 구현**
  - `dayjs` 를 추가한다: `/Users/junmyeongjo/Library/pnpm/pnpm add dayjs@1.11.23`
  - esbuild 번들에 dayjs 플러그인 import (`dayjs/plugin/utc.js`, `dayjs/plugin/timezone.js`) 가 포함되는지 build 로 확인한다.
  - `reserveQuota` 와 `addUsage` 는 postgres 의 `sql.begin` 을 쓴다.
- [ ] **Step 4: 확인** — Run: `/Users/junmyeongjo/Library/pnpm/pnpm test && /Users/junmyeongjo/Library/pnpm/pnpm typecheck && /Users/junmyeongjo/Library/pnpm/pnpm build` / Expected: 통과
- [ ] **Step 5: 커밋** — `feat: 할당량 규칙과 사용량 기록 저장소`

---

### Task 6: Lambda 예상량 검사와 호출별 사용량 기록 (comdraft-lambda)

**Files:**
- Create: `src/generation/estimate.ts`, `src/generation/estimate.test.ts`
- Modify: `src/generation/llm.ts` (사용량 콜백), `src/generation/limits.ts` (여유분 상수), `src/pipeline.ts` (준비 단계 분리), `src/placeholder-pipeline.ts`, `src/run-job.ts`, `src/run-job.test.ts`, `src/pipeline.test.ts`, `src/generation/anthropic-client.test.ts` (필요 시)

**Interfaces:**
- Consumes: Task 5 `reserveQuota`, `addUsage`
- Produces:
  - `LlmClient.parse` / `write` 요청에 `onUsage?: (tokens: number) => void | Promise<void>` 를 추가한다. 응답의 `usage` 네 항목 합을 넘기고, 재시도가 있으면 실제로 받은 응답마다 부른다.
  - `Pipeline<P, C, A>`:
    - `prepare(input): Promise<P>`
    - `estimate(input, prepared: P): number`
    - `classify(input, prepared: P): Promise<C>`
    - `analyze`, `write` 는 그대로
  - `PipelineInput` 에 `onUsage: (tokens: number) => Promise<void>`
  - `estimateJobTokens(prepared: { catalogTokens: number; hunkTokens: number; linkTokens: number; requestTokens: number }, length: Length, systemTokens: { plan: number; analyze: number; write: number }): number`
  - `limits.ts` 의 여유분 상수:
    - `ESTIMATE_PLAN_OUTPUT = 3_000`
    - `ESTIMATE_ANALYSIS_OUTPUT = 6_000`
    - `ESTIMATE_WRITE_OUTPUT = { short: 6_000, medium: 9_000, long: 14_000 }`
  - 예상량 = 시스템 토큰 합 + 요청 × 3 + 카탈로그 + min(hunk, `HUNK_TOKEN_BUDGET`) + 링크 + 기획 출력 × 2 + 분석 출력 × 2 + 작성 출력
    - 기획 출력과 분석 출력은 다음 단계 입력으로도 들어가므로 두 번 센다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// estimate.test.ts
test('입력과 길이에 따라 커진다', () => {
  const base = { catalogTokens: 5_000, hunkTokens: 10_000, linkTokens: 0, requestTokens: 100 };
  const sys = { plan: 2_000, analyze: 2_500, write: 2_500 };
  const short = estimateJobTokens(base, 'short', sys);
  assert.ok(estimateJobTokens(base, 'long', sys) > short);
  assert.ok(estimateJobTokens({ ...base, linkTokens: 9_000 }, 'short', sys) === short + 9_000);
  assert.ok(estimateJobTokens({ ...base, hunkTokens: 90_000 }, 'short', sys) === estimateJobTokens({ ...base, hunkTokens: 40_000 }, 'short', sys));
});
// run-job.test.ts (메모리 저장소에 reserveQuota/addUsage 추가, 가짜 pipeline 이 onUsage 호출)
test('할당량을 넘으면 Claude 호출 없이 quota_exceeded, 사용량 0', ...);   // classify 호출 수 0, errorCode 'quota_exceeded', used 0
test('정책이 없으면 internal 로 실패, Claude 호출 없음', ...);
test('단계마다 사용량이 더해진다', ...);                                 // classify 1_000, analyze 2_000, write 3_000 → used 6_000
test('두 번째 단계 실패 시 첫 단계 사용량 유지', ...);                    // classify 1_000 후 analyze throw → failed, used 1_000
// llm 테스트
test('사용량은 네 항목 합', ...);                                        // usage {input 10, output 20, cache_creation 3, cache_read 4} → onUsage(37)
```

- [ ] **Step 2: 실패 확인** — Run: `/Users/junmyeongjo/Library/pnpm/pnpm test` / Expected: FAIL
- [ ] **Step 3: 구현**
  - `pipeline.prepare`: 기존 `classify` 앞부분(`prepareCommits`, `indexHunks`, `safeFetchLinks`)을 옮긴다.
  - `estimate`: `getPromptPack(locale)` 의 실제 system 문자열을 `estimateTokens` 로 잰다. 카탈로그는 `renderCatalog` 결과, hunk 는 마스킹되지 않은 hunk 본문 합, 링크는 링크 본문, 요청은 `context.prompt` 로 잰다.
  - 각 `llm.parse` / `llm.write` 호출에 `onUsage: input.onUsage` 를 넘긴다.
  - `runJob`: 커밋을 가져온 뒤 `prepare` → `estimate` → `jobs.reserveQuota(jobId, estimate, new Date())` 순서로 부른다.
    - `'exceeded'` 면 `GenerationFailure('quota_exceeded')`, `'no_plan'` 이면 `GenerationFailure('internal')`.
    - `input.onUsage` 는 `(n) => jobs.addUsage(jobId, n)`.
  - placeholder pipeline 은 `prepare` 가 빈 값을, `estimate` 가 0 을 돌려준다.
- [ ] **Step 4: 확인** — Run: `/Users/junmyeongjo/Library/pnpm/pnpm test && /Users/junmyeongjo/Library/pnpm/pnpm typecheck && /Users/junmyeongjo/Library/pnpm/pnpm build` / Expected: 통과
- [ ] **Step 5: 커밋** — `feat: Claude 호출 전 예상량 검사와 호출별 사용량 기록`

---

### Task 7: 마무리 확인과 배포 (컨트롤러)

- [ ] **Step 1:** 두 저장소에서 전체 테스트, 타입 검사, 린트, 빌드를 돌린다 (comdraft 는 `/Users/junmyeongjo/Library/pnpm/pnpm build`).
- [ ] **Step 2:** 로컬 DB 에서 동시 요청을 확인한다 (Review Focus 2).
  - 같은 사용자의 작업 두 개를 만들고, 두 연결에서 `reserveQuota` 를 동시에 실행한다.
  - 둘 다 `'reserved'` 가 되지 않는지 본다. 남은 양이 한 번만 허용되는 크기로 테스트한다.
  - node 스크립트를 스크래치 디렉터리에 두고, `DATABASE_URL` 은 로컬로 한다.
- [ ] **Step 3:** 사용자에게 병합과 배포를 확인받은 뒤 진행한다.
  1. comdraft 를 main 에 병합하고 push 한다.
  2. comdraft-lambda 를 main 에 병합하고 push 한다.
  3. Lambda 를 배포한다 (`pnpm build`, `infra` 에서 `terraform apply`). AWS 명령은 사용자 확인 후에만 실행한다.
