# 커밋 트리거 자동 초안 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 연결한 브랜치에 `[comdraft] 옵션...` 커밋을 푸시하면 기준점 이후 대상 커밋(최대 20개)과 저장소별 프롬프트 프리셋으로 초안 작성을 시작하고, 스튜디오에서 기준점과 제외 커밋을 관리한다.

**Architecture:** GitHub App 의 push 웹훅을 `app/api/github/webhook` 에서 받아 서명을 검증하고, 순수 함수로 이벤트를 판정한 뒤 `after()` 에서 자동 실행한다. 대상 커밋은 DB 에 쌓지 않고 경계 SHA 와 제외 SHA 만 저장해, 실행 때와 스튜디오 표시 때 같은 순수 함수 `selectBatch` 로 GitHub compare 결과에서 계산한다. 작업 생성과 사용자 검사는 기존 `requestDraftGeneration` 에서 공용 모듈로 빼서 함께 쓴다.

**Tech Stack:** Next.js 16 App Router (`node_modules/next/dist/docs/` 확인, `after` 는 `next/server`), Drizzle + Supabase PostgreSQL, better-auth, Octokit(GitHub App 설치 토큰), Lingui, Tailwind v4, vitest

**Spec:** `docs/superpowers/specs/2026-11-24-commit-trigger-auto-draft-design.md`

## Global Constraints

- 저장소 `/Users/junmyeongjo/Workspace/comdraft`, main 에서 브랜치 `feat/commit-trigger-auto-draft` (worktree 쓰지 않음). Lambda 저장소는 변경 없음.
- 셸 PATH 앞에 `/Users/junmyeongjo/.nvm/versions/node/v24.12.0/bin` 을 붙여 pnpm 실행.
- 트리거: 제목 줄이 정확히 `[comdraft]` 로 시작하고 바로 뒤가 줄 끝 또는 공백. 옵션은 공백 구분, 대소문자 무시, 같은 종류는 앞의 값, 모르는 단어 무시. 커밋에서 받는 옵션은 톤·글 종류·길이만.
- 묶음 최대 20개 (`MAX_GENERATION_COMMITS` 재사용). 머지 커밋(부모 2개 이상), committer login `web-flow`, 제외 SHA, 빈 트리거 커밋은 건너뛰고 수에 넣지 않음.
- 기본 옵션 초기값: `DEFAULT_PROMPT_OPTIONS` 에서 `length` 만 `short`.
- 커밋 메시지·본문은 DB 에 저장하지 않음 (SHA 만).
- `pnpm db:generate` 로 마이그레이션 파일을 만들고 로컬은 `pnpm db:migrate:local` 로 직접 적용. `db:migrate:prod` 는 실행 금지 (운영은 사용자가 적용).
- Tailwind v4. 아이콘은 lucide SVG 를 `public/images/studio/` 에 파일로 넣어 `next/image` 로 씀 (`lucide-react` 설치하지 않음). 새 아이콘: `flag.svg`, `layers.svg`, `circle-slash.svg`, `git-merge.svg` (`undo-2.svg` 는 있음).
- 화면 문구는 Lingui, ko 원문 + en 번역. 링크는 `LocalizedLink`. 주석은 한국어.
- 새 환경 변수 `GITHUB_WEBHOOK_SECRET` (코드에 하드코딩 금지, `requireEnv` 로 읽음). 로컬 값은 `.env.development` 에 이미 있음 (출력 금지).
- 로컬 웹훅 수신: dev App `comdraft-dev` (운영 App 과 별개, `Contents: Read` 있음). `ngrok http 3003` 주소는 실행마다 바뀌므로 시험 전에 App JWT 로 `PATCH /app/hook/config` (`url`, `secret`, `content_type: json`) 를 호출해 갱신.
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. 푸시·PR·머지·배포는 사용자 요청 시에만.

## Review Focus

1. **같은 트리거의 웹훅 재전송이나 빠른 연속 트리거** — 작업은 한 번만 생기고 경계는 한 번만 옮겨져야 함 (Task 7 `trigger_sha` 유일 충돌 테스트, Task 6 경계 조건부 갱신).
2. **같은 저장소·브랜치를 여러 사용자가 연결** — 푸시한 사람의 행만 실행, 다른 사용자 행은 기록도 없음 (Task 3 `planPushEvent` 테스트 `다른 사람의 푸시는 무시`).
3. **`[Comdraft]`, `[comdraft]x`, `fix [comdraft]`, 옵션 사이 공백 여러 개·탭** — 앞의 셋은 트리거 아님, 마지막은 정상 해석 (Task 1 테스트).
4. **force push 뒤 경계 커밋이 사라짐** — 자동 실행은 `anchor_missing` 기록, 스튜디오는 다시 지정 안내 (Task 2 `compare 결과 diverged/404` 테스트, Task 10 화면).
5. **제외 커밋이 많아 20개 이상 건너뜀 + 넘침** — 스튜디오 표시와 실제 실행 묶음이 같아야 함 (둘 다 `selectBatch` 사용, Task 2 테스트 `제외는 수에 넣지 않음`).

---

### Task 1: 트리거 파싱

**Files:**
- Create: `lib/auto-draft/trigger.ts`
- Test: `lib/auto-draft/trigger.test.ts`

**Interfaces:**
- Produces: `TRIGGER_TAG = '[comdraft]'`, `interface TriggerOptions { tone?: Tone; postType?: PostType; length?: Length }`, `parseTrigger(message: string): TriggerOptions | null` (트리거가 아니면 null), `mergeTriggerOptions(base: PromptOptions, trigger: TriggerOptions): PromptOptions`

- [ ] **Step 1: 실패하는 테스트** — `parseTrigger('[comdraft]')` → `{}`, `'[comdraft] friendly short'` → `{ tone: 'friendly', length: 'short' }`, `'[comdraft]  LECTURE\tlong'` → `{ postType: 'lecture', length: 'long' }`, `'[comdraft] short long'` → `{ length: 'short' }`, `'[comdraft] hello short'` → `{ length: 'short' }`, 여러 줄 메시지는 첫 줄만 봄 (`'[comdraft] plain\n\nbody short'` → `{ tone: 'plain' }`), `it.each(['[Comdraft]', '[comdraft]x', 'fix [comdraft]', ' [comdraft]', ''])` → null. `mergeTriggerOptions(DEFAULT_PROMPT_OPTIONS, { length: 'long' })` 는 length 만 바뀜.
- [ ] **Step 2: 실행해 실패 확인** — `pnpm exec vitest run lib/auto-draft/trigger.test.ts` → FAIL (모듈 없음)
- [ ] **Step 3: 구현** — 값 목록은 `lib/studio/options.ts` 의 `TONES`, `POST_TYPES`, `LENGTHS` 를 씀 (server-only, DB, Lingui import 금지).
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS
- [ ] **Step 5: 커밋** — `feat: 커밋 트리거 파싱`

### Task 2: 대상 커밋 계산

**Files:**
- Create: `lib/auto-draft/batch.ts`
- Test: `lib/auto-draft/batch.test.ts`

**Interfaces:**
- Consumes: `parseTrigger` (Task 1)
- Produces:
  - `interface BranchCommit { sha: string; parentShas: string[]; message: string; committerLogin: string | null }`
  - `type CompareResult = { status: 'ok'; commits: BranchCommit[] } | { status: 'anchor_missing' }` (commits 는 오래된 순)
  - `type SkipReason = 'merge' | 'github' | 'excluded' | 'empty_trigger'`
  - `selectBatch(commits: BranchCommit[], { excludedShas, emptyShas }: { excludedShas: ReadonlySet<string>; emptyShas: ReadonlySet<string> }): { batchShas: string[]; skipped: Map<string, SkipReason> }` — batchShas 오래된 순, 최대 `MAX_GENERATION_COMMITS`
  - `getSkipReason(commit: BranchCommit, sets): SkipReason | null`
  - `compareStatusToResult(status: string | null): 'ok' | 'anchor_missing'` (`ahead`·`identical` → ok, `behind`·`diverged`·null(404) → anchor_missing)

- [ ] **Step 1: 실패하는 테스트** — 25개 일반 커밋 → batchShas 앞 20개 · 순서 유지 (`20개에서 멈춤`); 머지·`web-flow`·제외 커밋이 섞인 30개 → 건너뛴 것 빼고 20개 (`제외는 수에 넣지 않음`); 빈 트리거는 skipped `empty_trigger`, 변경 있는 트리거는 포함; 빈 배열 → `[]`; `compareStatusToResult` 4가지 + null.
- [ ] **Step 2: 실패 확인** — `pnpm exec vitest run lib/auto-draft/batch.test.ts` → FAIL
- [ ] **Step 3: 구현** — 트리거 판정은 `parseTrigger(message) !== null && emptyShas.has(sha)`.
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** — `feat: 자동 초안 대상 커밋 계산`

### Task 3: 웹훅 서명 검증과 push 이벤트 판정

**Files:**
- Create: `lib/auto-draft/webhook.ts`
- Test: `lib/auto-draft/webhook.test.ts`

**Interfaces:**
- Consumes: `parseTrigger` (Task 1)
- Produces:
  - `verifyWebhookSignature(secret: string, rawBody: string, header: string | null): boolean` — `sha256=` + HMAC-SHA256 hex, `crypto.timingSafeEqual` (길이가 다르면 false)
  - `interface PushEvent { ref: string; forced: boolean; senderId: number; repositoryId: number; commits: Array<{ id: string; message: string }> }`, `parsePushEvent(payload: unknown): PushEvent | null`
  - `type PushPlan = { kind: 'ignore' } | { kind: 'exclude_forced'; shas: string[] } | { kind: 'trigger'; triggerSha: string; options: TriggerOptions }`
  - `planPushEvent(event: PushEvent, target: { branch: string; githubAccountId: string }): PushPlan`

- [ ] **Step 1: 실패하는 테스트** — 서명: 맞는 값 true, 한 글자 다름·`sha1=`·null·길이 다름 false. 판정: `refs/heads/main` ≠ 대상 브랜치 → ignore; `다른 사람의 푸시는 무시` (senderId ≠ githubAccountId, 문자열·숫자 비교 주의); forced → `exclude_forced` (트리거가 있어도); 트리거 없음 → ignore; 트리거 둘 → 마지막(최신) 커밋. `parsePushEvent` 는 필드가 빠지면 null, `refs/tags/*` 도 그대로 파싱(판정에서 걸러짐).
- [ ] **Step 2: 실패 확인** — `pnpm exec vitest run lib/auto-draft/webhook.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** — `feat: 웹훅 서명 검증과 push 이벤트 판정`

### Task 4: 스키마와 마이그레이션 파일

**Files:**
- Create: `lib/db/schema/auto-draft.ts` (index.ts 에 export 추가)
- Modify: `lib/db/schema/draft.ts` (`draft_prompt` 컬럼)
- Create: `drizzle/0027_*.sql` (`pnpm db:generate`)

**Interfaces:**
- Produces:
  - `repositoryAutoDraft` (`repository_auto_draft`): `userId`, `repositoryId` (PK 둘, `user_repository` 에 cascade FK), `enabled` boolean default false, `prompt` text default '', `tone`·`postType`·`length` text, `requiredBlocks` text[], `model` text, `boundarySha` text null, `createdAt`, `updatedAt`
  - `repositoryExcludedCommit` (`repository_excluded_commit`): `userId`, `repositoryId`, `sha` (PK 셋, 같은 cascade FK), `reason` text `'user' | 'force_push'` (check), `createdAt`
  - `draftPrompt` 추가: `repositoryId` text null, `source` text `'studio' | 'commit_trigger'` default `'studio'` (check), `triggerSha` text null, 유일 인덱스 `draft_prompt_user_trigger_unique (user_id, trigger_sha) where trigger_sha is not null`
  - `export const DRAFT_PROMPT_SOURCES = ['studio', 'commit_trigger'] as const`, `EXCLUDED_COMMIT_REASONS = ['user', 'force_push'] as const`

- [ ] **Step 1: 스키마 작성** — 기본 옵션 컬럼 기본값은 `DEFAULT_PROMPT_OPTIONS` 와 같되 `length` 는 `'short'`.
- [ ] **Step 2: `pnpm db:generate`** → `drizzle/0027_*.sql` 생성 확인
- [ ] **Step 3: 생성된 SQL 끝에 기존 행 채우기 추가** — `update comdraft.draft_prompt dp set repository_id = d.repository_id from comdraft.draft d where dp.draft_id = d.id and dp.repository_id is null;`
- [ ] **Step 4: 적용과 검사** — `pnpm db:migrate:local` 실행 (성공 출력 확인), `pnpm exec tsc --noEmit -p .` 통과.
- [ ] **Step 5: 커밋** — `feat: 자동 초안 설정·제외 커밋 테이블과 요청 출처 컬럼`

### Task 5: 작업 생성 공용화와 실패 코드

**Files:**
- Create: `lib/generation/draft-job.ts` (`server-only`)
- Modify: `lib/actions/generation.ts` (공용 모듈 사용, 동작 동일), `lib/generation/jobs.ts` (`reserveGenerationSlot`), `lib/generation/contract.ts`, `components/studio/generation-progress.tsx`
- Test: `lib/generation/slot.test.ts` 또는 새 `lib/generation/draft-job.test.ts` (순수 부분만)

**Interfaces:**
- Produces:
  - `checkGenerationGate(user: GateUser, requestHeaders: Headers | null): Promise<GenerationGateResult>` (기존 로직 이동, 웹훅은 null)
  - `getGithubUserToken(userId: string, headers?: Headers)` — 헤더가 없으면 `auth.api.getAccessToken({ body })` 를 헤더 없이 호출. better-auth `resolveUserId` 는 헤더가 있는데 세션이 없으면 UNAUTHORIZED 이고, 헤더가 없으면 `userId` 로 진행함 (`node_modules/better-auth/dist/api/routes/account.mjs` 확인 완료). 빈 `new Headers()` 를 넘기면 안 됨.
  - `createDraftJob(userId: string, repositoryId: string, request: DraftJobRequest, locale: Locale): Promise<CreateJobResult<{ draftId: string; jobId: string }>>` — 기존 `createJob` 이동. `DraftJobRequest` = 기존 `ParsedRequest` + `source: DraftPromptSource` + `triggerSha: string | null`. INSERT 에 `repositoryId`, `source`, `triggerSha` 포함. `triggerSha` 유일 충돌이면 `{ status: 'duplicate' }` 를 추가로 돌려줌.
  - `GENERATION_ERROR_CODES` 에 추가: `'no_preset'`, `'no_commits'`, `'anchor_missing'`, `'rate_limited'`, `'too_many_active'`, `'quota_unavailable'`, `'model_locked'`
  - `reserveGenerationSlot` 시간당 집계에서 `source = 'commit_trigger' and draft_id is null` 행 제외

- [ ] **Step 1: 실패하는 테스트** — `isGenerationErrorCode('no_commits')` true 등 새 코드.
- [ ] **Step 2: 실패 확인** → FAIL
- [ ] **Step 3: 이동·추가 구현** — `requestDraftGeneration` 은 `checkGenerationGate(user, await headers())`, `createDraftJob(..., { ...request, source: 'studio', triggerSha: null })` 로 바꾸고 결과 타입은 그대로. `GENERATION_ERROR_MESSAGES` 에 새 코드 문구 추가:
  - `no_preset`: `프롬프트 프리셋이 없어 실행하지 않았습니다. 저장소 설정에서 프리셋을 입력해 주세요.`
  - `no_commits`: `기준점 이후 새 커밋이 없어 실행하지 않았습니다.`
  - `anchor_missing`: `기준점 커밋을 브랜치에서 찾을 수 없습니다. 스튜디오에서 기준점을 다시 지정해 주세요.`
  - `rate_limited`: `1시간 요청 한도를 넘어 실행하지 않았습니다.`
  - `too_many_active`: `진행 중인 작업이 많아 실행하지 않았습니다.`
  - `quota_unavailable`: `사용량 정책을 확인할 수 없어 실행하지 않았습니다.`
  - `model_locked`: `지금 등급에서 쓸 수 없는 모델이라 실행하지 않았습니다. 저장소 설정의 기본 옵션을 확인해 주세요.`
- [ ] **Step 4: 확인** — `pnpm test`, `pnpm exec tsc --noEmit -p .` 통과. 스튜디오에서 초안 요청이 전과 같이 동작 (로컬 가짜 실행기).
- [ ] **Step 5: 커밋** — `refactor: 초안 작업 생성과 사용자 검사를 공용 모듈로`

### Task 6: GitHub 조회와 자동 초안 저장소 계층

**Files:**
- Create: `lib/auto-draft/github.ts`, `lib/auto-draft/store.ts` (둘 다 `server-only`)
- Modify: `lib/actions/repository-settings.ts` (`changeRepositoryBranch` 에서 경계 다시 잡기)

**Interfaces:**
- Consumes: `BranchCommit`, `CompareResult`, `compareStatusToResult` (Task 2), 스키마 (Task 4), `getInstallationOctokit`
- Produces (`github.ts`, 설치 토큰 사용):
  - `compareBranch(repo: AutoDraftRepo, baseSha: string, headSha: string): Promise<CompareResult>` — compare API, 404 → anchor_missing. 커밋이 250개를 넘으면(`total_commits > commits.length`) 앞쪽이 잘린 것이므로 커밋 목록 API 로 base 까지 거슬러 올라가 채움.
  - `findEmptyCommits(repo: AutoDraftRepo, shas: string[]): Promise<Set<string>>` — 커밋 상세의 `files.length === 0`
  - `getBranchHead(repo: AutoDraftRepo): Promise<string | null>`, `getFirstParent(repo: AutoDraftRepo, sha: string): Promise<string | null>`
  - `interface AutoDraftRepo { installationId: number; owner: string; name: string; branch: string }`
- Produces (`store.ts`):
  - `getAutoDraftSetting(userId, repositoryId)`, `saveAutoDraftSetting(userId, repositoryId, values: { prompt: string; options: PromptOptions })`
  - `setAutoDraftEnabled(userId, repositoryId, enabled: boolean)` — 처음 켤 때(경계 null)만 `getBranchHead` 로 경계 설정, 끌 때와 다시 켤 때는 유지
  - `moveBoundary(userId, repositoryId, fromSha: string | null, toSha: string): Promise<boolean>` — `where boundary_sha is not distinct from fromSha` 조건부 갱신, 바뀐 행이 없으면 false
  - `listExcludedShas(userId, repositoryId): Promise<Map<string, ExcludedCommitReason>>`, `excludeCommits(userId, repositoryId, shas: string[], reason)`(충돌 무시), `restoreCommit(userId, repositoryId, sha)`
  - `findPushTargets(githubRepoId: number, branch: string): Promise<PushTarget[]>` — 자동 초안이 켜진 연결만
  - `interface PushTarget { userId: string; repositoryId: string; githubAccountId: string /* account.accountId, provider 'github' */; user: { id: string; role: string; bannedAt: Date | null }; repo: AutoDraftRepo; setting: { prompt: string; options: PromptOptions; boundarySha: string | null } }`
  - `resetBoundaryForBranch(userId, repositoryId)` — 브랜치 변경 시 새 브랜치 최신 커밋으로

- [ ] **Step 1: 구현** (네트워크·DB 계층이라 단위 테스트 대신 Task 8 의 로컬 통합 확인으로 검증)
- [ ] **Step 2: 확인** — `pnpm exec tsc --noEmit -p .`, `pnpm exec eslint lib/auto-draft lib/actions/repository-settings.ts`
- [ ] **Step 3: 커밋** — `feat: 자동 초안 GitHub 조회와 설정 저장 계층`

### Task 7: 자동 실행

**Files:**
- Create: `lib/auto-draft/run.ts` (`server-only`)
- Test: `lib/auto-draft/run.test.ts` (의존성 주입한 순수 오케스트레이션)

**Interfaces:**
- Consumes: Task 1·2·5·6
- Produces: `runAutoDraft(target: PushTarget, triggerSha: string, trigger: TriggerOptions, deps?: RunDeps): Promise<RunOutcome>` — `RunOutcome = { status: 'started'; jobId: string } | { status: 'skipped'; errorCode: GenerationErrorCode } | { status: 'duplicate' }`. `RunDeps` 는 compare·gate·createDraftJob·runner·recordFailure·moveBoundary 를 묶은 객체 (기본값은 실제 구현).
- 순서는 스펙 §7: 프리셋 → gate(헤더 null) → 모델 허용 → compare(경계, 트리거) + 빈 트리거 확인 + selectBatch → createDraftJob(`commitShas` 최신순, `source: 'commit_trigger'`, `triggerSha`, locale 은 그 사용자의 가장 최근 `draft_prompt.locale`, 없으면 `DEFAULT_LOCALE`) → runner.start → `moveBoundary(이전 경계, batch 마지막)`
- 시작 전에 막히면 `recordFailure` 가 `draft_prompt` 행을 INSERT (`draft_id` null, `status` failed, `error_code`, `repository_id`, `source`, `trigger_sha`, 프리셋 prompt·옵션, `finished_at` now). `trigger_sha` 충돌이면 `duplicate`.

- [ ] **Step 1: 실패하는 테스트** — 가짜 deps 로: 프리셋 빈 문자열 → skipped `no_preset`; compare anchor_missing → `anchor_missing`; 묶음 비면 `no_commits`; gate quota → `quota_exceeded`; slot rate_limited → `rate_limited`; 정상 → started 이고 `moveBoundary` 가 묶음 마지막 SHA 로 한 번 불림, `commitShas` 는 최신순; createDraftJob duplicate → duplicate 이고 runner 안 불림; runner 실패 → 기존처럼 job 실패, 경계 안 옮김.
- [ ] **Step 2: 실패 확인** — `pnpm exec vitest run lib/auto-draft/run.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** — `feat: 커밋 트리거 자동 초안 실행과 실패 기록`

### Task 8: 웹훅 경로

**Files:**
- Create: `app/api/github/webhook/route.ts`
- Modify: `lib/github/env.ts` (`webhookSecret: requireEnv('GITHUB_WEBHOOK_SECRET')` 를 따로 읽는 함수, 다른 경로가 이 변수 없이도 동작하도록 분리), `.env.example` 이 있으면 키 추가

**Interfaces:**
- Consumes: Task 3·6·7
- 흐름: `await request.text()` 로 원문을 받아 서명 검증 (JSON 파싱 전) → 401 / `x-github-event !== 'push'` → 200 / `parsePushEvent` → 대상마다 `planPushEvent` → `exclude_forced` 는 `excludeCommits(..., 'force_push')` → `trigger` 는 `after(() => runAutoDraft(...))` → 202. `proxy.ts` 가 `/api` 를 건드리지 않는지 확인.

- [ ] **Step 1: 구현**
- [ ] **Step 2: 로컬 통합 확인** — `ngrok http 3003` 을 백그라운드로 띄우고 `http://127.0.0.1:4040/api/tunnels` 에서 주소를 읽어 dev App 웹훅을 `PATCH /app/hook/config` 로 `{주소}/api/github/webhook` 과 `.env.development` 의 secret 으로 갱신. 확인이 끝나면 ngrok 을 끔. 테스트 저장소에서: 토글 켬 → 커밋 3개 → `[comdraft] friendly short` 빈 커밋 푸시 → 새 초안과 작업 생성, 경계가 세 번째 커밋으로 이동. 같은 배달 재전송 → 작업 그대로 1개. 새 커밋 없이 `[comdraft]` → 프롬프트 내역에 `no_commits`. 서명 틀린 curl → 401.
- [ ] **Step 3: 커밋** — `feat: GitHub push 웹훅으로 자동 초안 시작`

### Task 9: 저장소 설정 화면과 프롬프트 내역

**Files:**
- Create: `lib/actions/auto-draft.ts` (`'use server'`), `components/studio/auto-draft-settings-section.tsx`
- Modify: `components/studio/repository-settings-panel.tsx`, `lib/actions/repository-settings.ts` (`loadPromptHistoryPage`), `lib/studio/prompt-history.ts`
- Test: `lib/studio/prompt-history.test.ts` (기존에 추가)

**Interfaces:**
- Produces (액션, 모두 `requireSession` + 소유 확인):
  - `getAutoDraftSettings(repositoryId): Promise<{ status: 'ok'; enabled: boolean; prompt: string; options: PromptOptions } | { status: 'not_found' }>`
  - `saveAutoDraftSettings(repositoryId, input: { prompt: unknown; options: unknown }): Promise<{ status: 'ok' } | { status: 'invalid' | 'not_found' | 'model_locked' }>` — prompt 0~`MAX_GENERATION_PROMPT_LENGTH`자, `parsePromptOptions`
  - `toggleAutoDraft(repositoryId, enabled: boolean): Promise<{ status: 'ok' } | { status: 'not_found' | 'unavailable' }>`
- `PromptHistoryItem` 변경: `draftId: string | null`, `source: DraftPromptSource`, `triggerSha: string | null`, `errorCode: GenerationErrorCode | null`
- 내역 조회: `innerJoin(draft)` → `leftJoin(draft)`, 조건 `draftPrompt.userId = userId and draftPrompt.repositoryId = repositoryId and (draftPrompt.draftId is not null or draftPrompt.source = 'commit_trigger')`. `groupPromptHistory` 는 `draftId` 가 null 인 항목을 묶지 않고 단독으로.

- [ ] **Step 1: 실패하는 테스트** — `groupPromptHistory` 에 draftId null 인 자동 실행 실패 항목이 섞여도 단독 항목으로 순서 유지.
- [ ] **Step 2: 실패 확인 → 구현 → 통과 확인** — `pnpm exec vitest run lib/studio/prompt-history.test.ts`
- [ ] **Step 3: 화면** — 설정 패널에 "커밋으로 초안 만들기" 섹션: 토글, 프롬프트 프리셋 textarea, 기본 옵션(`PromptOptions` 컴포넌트 재사용), 저장 버튼, 사용법(`[comdraft] friendly short` 예와 옵션 값 표), 안내 `PR 머지로 들어온 커밋, 머지 커밋, force push 로 올라온 커밋은 모이지 않습니다.` 내역 항목: 자동 실행이면 `git-commit.svg` 아이콘 + 트리거 커밋 링크(짧은 SHA), 실패면 `GENERATION_ERROR_MESSAGES[errorCode]` 문구, 초안이 없으면 초안 링크 없음.
- [ ] **Step 4: 확인** — 미리보기에서 토글·저장·다시 열기 값 유지, 실패 행 표시 (PC·모바일).
- [ ] **Step 5: 커밋** — `feat: 저장소 설정에 커밋 트리거 자동 초안 설정과 실행 기록`

### Task 10: 스튜디오 커밋 목록 표시와 기준점·제외

**Files:**
- Create: `components/shared/tooltip.tsx`, `components/studio/commit-markers.tsx`, `hooks/use-auto-draft-state.ts`, `public/images/studio/{flag,layers,circle-slash,git-merge}.svg`
- Modify: `lib/github/user-api.ts` (`GithubUserCommit` 에 `parents: Array<{ sha: string }>`, `committer: { login: string } | null`), `lib/github/commits.ts`, `lib/actions/studio.ts` (`StudioCommit` 에 `parentShas: string[]`, `committerLogin: string | null`), `lib/actions/auto-draft.ts`, `components/studio/commit-sidebar.tsx`

**Interfaces:**
- Produces (액션):
  - `loadAutoDraftState(repositoryId): Promise<{ status: 'off' } | { status: 'ok'; anchorSha: string | null; batchShas: string[]; excluded: Array<{ sha: string; reason: ExcludedCommitReason }> } | { status: 'anchor_missing'; excluded: ... } | { status: 'not_found' }>` — 경계~브랜치 최신을 `compareBranch` + `selectBatch` 로 계산, `anchorSha` = 경계 다음 첫 대상 커밋(없으면 null)
  - `setAutoDraftAnchor(repositoryId, sha: string)` — 서버가 `getFirstParent` 로 경계 = 첫 부모 (부모 없는 루트 커밋이면 `invalid`), 이전 경계와 무관하게 덮어씀
  - `excludeAutoDraftCommit(repositoryId, sha)`, `restoreAutoDraftCommit(repositoryId, sha)`
- `Tooltip`: `{ label: string; children: ReactElement }` — 마우스 올림·키보드 포커스 때 표시, 터치는 탭으로 열고 바깥 탭으로 닫음, `role="tooltip"` + `aria-describedby`. 모양은 `components/admin/claude-status-indicator.tsx` 의 툴팁과 맞춤.

- [ ] **Step 1: 아이콘 표시** — 커밋 줄 오른쪽 링크 앞에 표시 (스펙 §9.2 표의 아이콘·툴팁 문구 그대로, 자동 대상 툴팁의 n/20 은 묶음 안 순번). "수집 안 됨"은 `parentShas.length > 1 || committerLogin === 'web-flow'`.
- [ ] **Step 2: 동작 버튼** — 커밋 줄 `ellipsis` 메뉴에 "여기를 기준점으로", "제외"/"제외 취소". 체크박스 선택은 건드리지 않음. 동작 뒤 `loadAutoDraftState` 다시 읽음.
- [ ] **Step 3: 요약** — 목록 위 "자동 대상 n/20", `anchor_missing` 이면 `기준점 커밋을 찾을 수 없습니다. 커밋 메뉴에서 기준점을 다시 지정해 주세요.` 자동 초안이 꺼져 있으면 표시·메뉴 항목 숨김.
- [ ] **Step 4: 확인** — 미리보기(PC 1440·모바일 375): 기준점 변경 → 20개 표시 재계산, 제외 → 표시 바뀌고 n 감소·다음 커밋이 들어옴, 제외 취소, 툴팁 hover·Tab 포커스·모바일 탭.
- [ ] **Step 5: 커밋** — `feat: 스튜디오 커밋 목록에 기준점·자동 대상·제외 표시`

### Task 11: 마무리

**Files:**
- Modify: `locales/{ko,en}.po` → `locales/*.ts`, `docs/superpowers/specs/2026-11-24-commit-trigger-auto-draft-design.md` (상태 줄)

- [ ] **Step 1: 번역** — `pnpm i18n:extract`, en 빈 항목 채움, `pnpm i18n:compile` → en Missing 0
- [ ] **Step 2: 검사** — `pnpm test`, `pnpm exec eslint app components hooks lib`, `pnpm exec tsc --noEmit -p .`, `pnpm exec next build` 모두 통과
- [ ] **Step 3: 운영 준비 안내 정리** — 사용자에게 전달할 목록: 운영 마이그레이션 적용, Vercel `GITHUB_WEBHOOK_SECRET`, GitHub App 웹훅 URL `https://comdraft.dev/api/github/webhook`·secret·Push 구독, `Contents: Read` 권한 확인
- [ ] **Step 4: 커밋** — `chore: 자동 초안 번역과 마무리`
