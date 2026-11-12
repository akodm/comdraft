# 작성 전 되묻기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 커밋 메시지·diff·요청·링크로 글의 흐름이나 맥락을 정할 수 없을 때만, 기획 단계가 작업을 멈추고 작성자에게 1~3개 질문(보기 + 직접 입력)을 묻는다. 답을 받은 뒤 같은 작업을 다시 실행한다.

**Architecture:** 기획 출력 맨 앞에 `clarify` 를 두고, Lambda 는 처음 실행에서만 이 값을 본다. 묻기로 하면 질문을 `draft_prompt.clarification` 에 저장하고 작업을 `awaiting_input` 으로 바꾼 뒤 끝낸다. comdraft 는 이 상태를 편집 잠금으로 다루고 질문 카드를 보여 준다. 답하기·그냥 작성을 누르면 서버 액션이 답을 저장하고 작업을 `queued` 로 되돌려 같은 jobId 로 Lambda 를 다시 부른다. 재실행에서는 묻지 않고, 답을 기획·분석·작성·검토 프롬프트에 "작성자가 보탠 맥락"으로 넣는다.

**Tech Stack:** Next.js 16, drizzle, Lingui, vitest (comdraft) / TypeScript (Node strip-types), node:test, zod, @anthropic-ai/sdk 구조화 출력 (comdraft-lambda)

**Spec:** `docs/superpowers/specs/2026-11-12-clarifying-questions-design.md`

## Global Constraints

- 저장소와 브랜치 (worktree 를 만들지 않는다):
  - Task 1~5: `/Users/junmyeongjo/Workspace/comdraft` 의 `feat/clarifying-questions` (이미 있음)
  - Task 6~8: `/Users/junmyeongjo/Workspace/comdraft-lambda` 의 `feat/clarifying-questions` (`main` 에서 새로 만든다)
  - Task 9: 비교 도구. 커밋하지 않는 로컬 파일만 다룬다.
- 셸 명령 앞에 `export PATH=/Users/junmyeongjo/.nvm/versions/node/v24.12.0/bin:$PATH;` 를 붙인다 (pnpm 11).
- 검사 명령:
  - comdraft: `pnpm test`, `pnpm typecheck` (없으면 `pnpm exec tsc --noEmit`), `pnpm exec eslint <바꾼 파일>`
  - lambda: `pnpm test`, `pnpm typecheck`
  - lambda 저장소에는 prettier 를 돌리지 않는다.
- 하지 않는 것:
  - `db:migrate*`, `terraform apply`, `git push`
  - Anthropic API 키(`~/.comdraft-compare-key`)를 출력하거나 명령줄에 그대로 쓰는 것. 환경 변수로만 읽는다.
- 화면은 테일윈드 v4 로 짓고, 아이콘은 lucide 를 쓴다. 문구는 Lingui `Trans`/`msg` 로 쓰고 `pnpm i18n:extract` 후 en.po 를 채운다.
- 주석과 테스트 이름은 한국어로 쓰고 기존 파일 말투를 따른다. 디버그용 `console` 은 남기지 않는다. 오류·로그에는 질문·답 원문 대신 사유 코드만 넣는다.
- ko.ts 와 en.ts 는 같은 구조를 유지한다. 한쪽을 바꾸면 다른 쪽도 같은 뜻으로 바꾼다.
- `contract.ts` 는 양쪽 저장소에서 같은 값을 쓴다 (상태, 오류 코드, 질문 형식).
- 고정 값 (스펙과 이 계획의 판정):
  - 상태 `awaiting_input`, 오류 코드 `cancelled`
  - 질문 최대 3개, 보기 최대 3개, 보기가 2개 미만이면 보기를 비운다
  - 질문 id 는 `Q1`, `Q2`, `Q3`
  - `CLARIFY_REASON_MAX = 200`, `CLARIFY_QUESTION_MAX = 200`, `CLARIFY_OPTION_MAX = 120` (lambda 가 앞뒤 공백을 빼고 이 글자 수까지만 남김)
  - `CLARIFICATION_ANSWER_MAX_LENGTH = 500` (comdraft 입력 상한)
  - 문구 ko / en:
    - 카드 머리: `글의 방향을 정하려면 조금 더 알려 주세요` / `Tell us a bit more to set the direction of the post`
    - 직접 입력 보기: `직접 입력` / `Write my own`
    - 주 버튼: `답하고 작성` / `Answer and write`
    - 답 없이 진행: `그냥 작성` / `Write anyway`
    - 취소 버튼: `취소` / `Cancel`
    - 목록 표시: `답변 대기` / `Awaiting answer`
    - 취소 오류 문구: `작성을 취소했습니다.` / `Writing was cancelled.`
    - 이미 처리된 질문: `이미 처리된 질문입니다. 화면을 새로 고쳐 주세요.` / `This question was already handled. Please refresh the page.`
  - 프롬프트 표식 (테스트용):
    - `clarifyRuleMarker` ko `글의 방향이 갈릴 때만 묻는다` / en `Ask only when the post could split into different posts`
    - 맥락 블록 제목 ko `## 작성자가 보탠 맥락` / en `## Context the author added`

## 스펙에서 바꾼 점 (판정)

- **재실행 때 `started_at`:** 스펙 3.2 는 재실행 때 `started_at = null` 로 둔다고 적었다. 그런데 queued 시간 초과는 `created_at` 기준이라, 몇 분 뒤에 답한 작업은 다시 queued 가 되자마자 시간 초과로 실패한다.
  - 바꾼 규칙: 재실행 때 `started_at = now()` 로 두고, queued 시간 초과도 `coalesce(started_at, created_at)` 기준으로 본다. 그러면 queued 판정은 "다시 대기열에 넣은 시각"부터 재고, Lambda 가 시작하면 `markRunning` 이 같은 컬럼을 덮는다.
  - Task 1 에서 스펙 3.2·3.3 의 해당 문장과 `started_at` 컬럼 주석을 함께 고친다.
- **서버 액션 테스트:** 이 저장소에는 DB 를 쓰는 서버 액션 단위 테스트가 없다. 그래서 답 검증·상태 판단은 순수 함수로 빼서 테스트하고, 액션 흐름은 Task 5 로컬 화면 확인에서 확인한다.
- **화면 감시:** `awaiting_input` 동안에는 Lambda 가 돌지 않으므로 Realtime 구독과 5초 주기 조회를 멈춘다 (`shouldWatchJob` 이 거짓). 답하기를 누르면 액션이 돌려준 queued 작업으로 다시 감시를 시작한다.
- **취소한 작업:** `cancelled` 로 끝난 작업은 화면을 다시 열어도 실패 안내로 보여 주지 않는다 (`isJobResumable` 이 거짓).
- **분석 근거 번호:** 작성자가 보탠 답은 요청과 같은 근거 번호 `R` 로 인용한다. 근거 번호 형식은 바꾸지 않는다.
- **다시 기획(replan):** 처음 기획이 묻기로 하면 replan 없이 바로 멈춘다. replan 결과의 `clarify` 는 항상 무시한다.

## Review Focus

1. 몇 분 뒤에 답해 다시 queued 가 된 작업이 곧바로 timeout 으로 실패하는 경우 → 시간 초과 판정이 재대기 시각 기준이어야 한다. Task 2 `isJobStale` 테스트, Task 3 `expireStaleJobs` 조건.
2. 다른 탭에서 같은 질문에 두 번 답하는 경우 → 두 번째 요청은 조건부 UPDATE 에 걸려 `not_found` 가 되고, Lambda 를 두 번 부르지 않아야 한다. Task 3 `requeueAwaitingJob` 조건.
3. 모델이 `needed: true` 인데 질문이 0개이거나 문장이 비었거나 보기가 1개인 경우 → 묻지 않거나 직접 입력만 남겨야 한다. Task 6 `validateClarify` 테스트.
4. 재실행에서 모델이 또 `clarify.needed: true` 를 내는 경우 → 무시하고 작성까지 끝나야 한다. Task 8 파이프라인·runJob 테스트.
5. 없는 질문 id, 공백만 있는 답, 500자를 넘는 답 → 답하기가 `invalid` 여야 한다. Task 2 `parseClarificationAnswers` 테스트.

---

### Task 1: 계약·스키마·마이그레이션 (comdraft)

**Files:**
- Modify: `lib/generation/contract.ts`, `lib/db/schema/draft.ts`, `components/studio/generation-progress.tsx` (오류 문구 표에 `cancelled` 추가), `docs/superpowers/specs/2026-11-12-clarifying-questions-design.md` (판정 반영)
- Create: `drizzle/0020_*.sql`, `drizzle/meta/0020_snapshot.json`, `drizzle/meta/_journal.json` 갱신 (`pnpm db:generate` 가 만듦)

**Interfaces:**
- Produces (`contract.ts`):
  - `GenerationStatus = 'queued' | 'running' | 'awaiting_input' | 'completed' | 'failed'`
  - `GENERATION_ERROR_CODES` 에 `'cancelled'` (작성자가 질문 카드에서 취소). 위치는 `'internal'` 앞.
  - `export interface GenerationClarificationQuestion { id: string; question: string; options: string[] }`
  - `export interface GenerationClarificationAnswer { id: string; answer: string }`
  - `export interface GenerationClarification { reason: string; questions: GenerationClarificationQuestion[]; answers: GenerationClarificationAnswer[] | 'skipped' | null }`
  - `export const CLARIFICATION_ANSWER_MAX_LENGTH = 500`
- Produces (`draft.ts`): `DRAFT_PROMPT_STATUSES` 에 `'awaiting_input'`; 컬럼 `clarification: jsonb('clarification').$type<GenerationClarification>()`; 유일 인덱스 조건 `in ('queued', 'running', 'awaiting_input')`; 상태 제약에 `'awaiting_input'`.

- [ ] **Step 1:** `contract.ts` 를 고친다. 머리 주석의 흐름 설명에 "기획이 묻기로 하면 awaiting_input 으로 멈추고, 답을 받으면 같은 작업을 queued 로 되돌려 다시 실행"을 한 줄 더한다.
- [ ] **Step 2:** `draft.ts` 를 고친다.
  - 상태 목록, 인덱스, 제약, 새 컬럼 `clarification` 을 넣는다.
  - `started_at` 주석은 "Lambda 가 처리를 시작한 시각, 답을 받아 다시 대기열에 넣은 시각 (시간 초과 판정 기준)"으로 바꾼다.
  - 파일 머리 주석의 "진행 중(queued/running)인 작업은 하나만"에 awaiting_input 을 더한다.
- [ ] **Step 3:** `generation-progress.tsx` 의 `GENERATION_ERROR_MESSAGES` 에 `cancelled: msg\`작성을 취소했습니다.\`` 를 더한다 (Record 타입이 요구함).
- [ ] **Step 4:** `pnpm db:generate` 를 실행한다. 만들어진 SQL 에 아래 세 가지가 있는지 확인한다.
  - `ADD COLUMN "clarification" jsonb`
  - 제약 `draft_prompt_status_check` 를 지우고 새 조건으로 다시 만드는 문
  - 인덱스 `draft_prompt_draft_active_unique` 를 지우고 새 where 로 다시 만드는 문

  다른 테이블이 바뀌었다면 멈추고 원인을 찾는다. `db:migrate` 는 하지 않는다.
- [ ] **Step 5:** 스펙 3.2 의 "`started_at = null`"을 "`started_at = now()` (queued 시간 초과를 재대기 시각부터 재기 위함)"로, 3.3 의 시간 초과 문장을 "queued 시간 초과는 `coalesce(started_at, created_at)` 기준"으로 고친다.
- [ ] **Step 6:** `pnpm typecheck`. 이 단계에서 깨지는 곳은 `Record<GenerationStatus, …>` 같은 망라 검사뿐이어야 한다. 깨진 곳은 Task 2~5 범위가 아니면 여기서 고친다.
- [ ] **Step 7:** 커밋 `feat: 답변 대기 상태와 되묻기 질문 컬럼 추가`

### Task 2: 상태 판단과 답 검증 (comdraft, 순수 함수)

**Files:**
- Modify: `lib/generation/job-state.ts`, `lib/generation/job-state.test.ts`, `lib/generation/quota.test.ts`
- Create: `lib/generation/clarification.ts`, `lib/generation/clarification.test.ts`

**Interfaces:**
- Consumes: Task 1 의 contract 타입
- Produces:
  - `job-state.ts`:
    - `isJobAwaitingInput(status: GenerationStatus): boolean`
    - `isJobLocking`: 초안 작성 작업의 `awaiting_input` 도 잠금
    - `isJobStale`: queued 는 `(startedAt ?? createdAt) < queuedCreatedBefore`, awaiting_input 은 항상 false
    - `shouldWatchJob`: awaiting_input 이면 false
    - `isJobResumable`: awaiting_input 은 true, `errorCode === 'cancelled'` 인 실패는 false. 인자 타입에 `errorCode: GenerationErrorCode | null` 을 더한다.
  - `clarification.ts`:
    - `parseStoredClarification(value: unknown): GenerationClarification | null`: 형식이 다르면 null. 질문은 id·question 이 문자열이고 options 가 문자열 배열인 것만 남기고, 질문이 0개면 null.
    - `parseClarificationAnswers(input: unknown, questions: GenerationClarificationQuestion[]): GenerationClarificationAnswer[] | null`
      - 배열이 아니면 null
      - 항목마다 `{ id, answer }` 문자열이어야 한다
      - id 는 질문 목록 안의 값이어야 한다. 중복 id 는 첫 번째만 남긴다
      - answer 는 trim 해서 1~500자
      - 하나라도 어긋나면 null, 남은 답이 0개여도 null
      - 결과는 질문 순서대로

- [ ] **Step 1: 실패하는 테스트 작성**
  - `job-state.test.ts`:
    - `답변 대기 중인 초안 작성 작업은 편집기를 잠그지만 따라가지 않는다`: isJobLocking true, shouldWatchJob false
    - `답변 대기는 시간 초과가 아니다`: createdAt 이 한 시간 전이어도 false
    - `다시 대기열에 넣은 작업은 재대기 시각부터 잰다`:
      - queued, createdAt 10분 전, startedAt 10초 전 → false
      - startedAt 2분 전 → true
    - `답변 대기 작업은 이어 보고, 취소로 끝난 작업은 이어 보지 않는다`
  - `clarification.test.ts`:
    - 정상 파싱
    - 형식 오류 → null
    - 질문 0개 → null
    - 답:
      - 정상 두 개 → 질문 순서대로
      - 없는 id → null
      - 공백만 → null
      - 501자 → null
      - 500자 → 통과
      - 빈 배열 → null
      - 중복 id → 첫 번째만
  - `quota.test.ts`: `답변 대기 작업은 예상량이 남아 있어도 쓴 토큰만 센다` (estimatedTokens 50_000, usedTokens 9_000 → 9_000). `getJobUsage` 는 이미 그렇게 동작할 수 있지만 규칙을 테스트로 고정한다.
- [ ] **Step 2:** `pnpm test lib/generation` → 새 테스트가 실패하는지 확인
- [ ] **Step 3:** 구현. `isJobActive` 는 queued/running 그대로 둔다 (Lambda 가 도는 중이라는 뜻).
- [ ] **Step 4:** `pnpm test`, `pnpm typecheck` 통과. `isJobResumable` 호출부(`lib/studio/queries.ts`)는 `GenerationJobView` 가 이미 errorCode 를 가지므로 그대로 컴파일돼야 한다.
- [ ] **Step 5:** 커밋 `feat: 답변 대기 상태 판단과 되묻기 답 검증`

### Task 3: 작업 저장소와 서버 액션 (comdraft)

**Files:**
- Modify: `lib/generation/jobs.ts`, `lib/actions/generation.ts`

**Interfaces:**
- Consumes: Task 2 의 `parseStoredClarification`, `parseClarificationAnswers`
- Produces (`jobs.ts`):
  - `GenerationJobView` 에 `clarification: { reason: string; questions: GenerationClarificationQuestion[] } | null`. awaiting_input 일 때만 값이 있고 답은 넣지 않는다. `jobViewColumns` 에 `clarification` 컬럼을 더한다.
  - `LOCKING_ACTIVE_STATUSES = ['queued', 'running', 'awaiting_input']`: `isDraftLocked` 와 `lockingJobExists` SQL 이 쓴다. `failJob` 은 계속 queued/running 만.
  - `expireStaleJobs`: queued 분기를 `coalesce(started_at, created_at) < cutoff` 로 바꾼다.
  - `requeueAwaitingJob(jobId: string, answers: GenerationClarificationAnswer[] | 'skipped'): Promise<boolean>`
    - 조건: `id = jobId and kind = 'draft' and status = 'awaiting_input'`
    - 바꾸는 값: `status = 'queued'`, `step = 0`, `started_at = now`, `clarification = jsonb_set(clarification, '{answers}', $answers::jsonb)`
  - `cancelAwaitingJob(jobId: string): Promise<boolean>`
    - 조건: `status = 'awaiting_input'`
    - 바꾸는 값: `status = 'failed'`, `error_code = 'cancelled'`, `finished_at = now`
  - `pauseJobForInput(jobId: string, clarification: { reason: string; questions: GenerationClarificationQuestion[] }): Promise<{ channel: string } | null>`: 가짜 작성기 전용으로, Lambda 의 `pauseForInput` 과 같은 규칙이다 (Task 8 참고).
- Produces (`generation.ts`):
  - `resumeClarifiedJob(input: { jobId: string; answers: unknown }): Promise<ResumeClarifiedJobResult>`
    - `answers` 는 `'skipped'` 이거나 답 배열
    - `ResumeClarifiedJobResult = { status: 'started'; job: GenerationJobView } | { status: 'invalid' | 'not_found' | 'github_reauth' | 'runner_unavailable' }`
  - `cancelClarifiedJob(jobId: string): Promise<{ status: 'cancelled' | 'not_found' }>`

- [ ] **Step 1:** `jobs.ts` 를 고친다. `toJobView` 는 `status === 'awaiting_input'` 일 때만 `parseStoredClarification` 결과에서 reason·questions 를 넣는다. 파싱에 실패하면 null 로 둔다 (화면은 질문 없이 "그냥 작성·취소"만 보여 줌, Task 5).
- [ ] **Step 2:** `resumeClarifiedJob` 을 구현한다.
  1. `requireSession`, `getUserJob`. 내 작업이 아니거나, 초안 작성 작업이 아니거나, awaiting_input 이 아니면 `not_found`.
  2. answers 가 `'skipped'` 가 아니면 저장된 질문으로 `parseClarificationAnswers`. null 이면 `invalid`.
  3. `getGithubUserToken`. `GithubUserTokenError` 이면 `github_reauth`.
  4. `requeueAwaitingJob`. false 면 `not_found` (다른 탭이 먼저 처리함).
  5. `getGenerationRunner().start`. 예외면 `failJob(jobId, 'runner_unavailable')`, `refresh()`, `runner_unavailable`.
  6. `refresh()` (목록의 답변 대기 표시를 지움), `{ status: 'started', job: await getUserJob(...) }`.

  시간당 요청 수와 주간 할당량은 검사하지 않는다. 재실행은 새 요청이 아니고, 사용량은 Lambda 가 예상량을 예약할 때 검사한다.
- [ ] **Step 3:** `cancelClarifiedJob` 을 구현한다. 소유를 확인하고 `cancelAwaitingJob`. 성공하면 `refresh()` 후 `cancelled`.
- [ ] **Step 4:** `getGenerationStatus` 의 `isTerminal` 이 awaiting_input 을 포함하지 않는지 확인한다 (사용량을 돌려주지 않음).
- [ ] **Step 5:** `pnpm test`, `pnpm typecheck`, `pnpm exec eslint lib/generation/jobs.ts lib/actions/generation.ts`
- [ ] **Step 6:** 커밋 `feat: 되묻기 답을 받아 작업을 다시 실행하는 서버 액션`

### Task 4: 가짜 작성기의 되묻기 (comdraft)

**Files:**
- Modify: `lib/generation/fake-runner.ts`, 같은 폴더의 fake-runner 테스트가 있으면 그 파일 (없으면 `lib/generation/fake-runner.test.ts` 생성)

**Interfaces:**
- Consumes: Task 3 의 `pauseJobForInput`
- Produces:
  - `FAKE_CLARIFY_KEYWORD = '[clarify]'`
  - `getFakeSimulation` 이 `'clarify'` 를 돌려줄 수 있음 (개발 환경에서만, 확인 순서 fail → stall → clarify)
  - `FAKE_CLARIFICATION`: 질문 2개를 둔다. 첫 질문은 보기 2개, 둘째 질문은 보기 없이 직접 입력만 (카드의 두 형태를 다 확인하기 위함). 문구는 ko 고정 (개발용).

- [ ] **Step 1: 실패하는 테스트:** `getFakeSimulation('글 써줘 [clarify]', true) === 'clarify'`, `getFakeSimulation('[clarify]', false) === null`
- [ ] **Step 2:** `loadJobContext` 가 `clarification` 도 읽게 한다. 초안 작성 작업에서 simulation 이 clarify 이고 `clarification` 이 null 이면, 커밋을 조회한 뒤 `pauseJobForInput` 을 부르고 `signal('awaiting_input')` 후 끝낸다. 재실행(`clarification` 이 있음)은 평소처럼 완료한다.
- [ ] **Step 3:** `pnpm test`, `pnpm typecheck`
- [ ] **Step 4:** 커밋 `feat: 가짜 작성기에 되묻기 흉내 추가`

### Task 5: 질문 카드와 목록 표시 (comdraft 화면)

**Files:**
- Create: `components/studio/clarification-card.tsx`, `lib/studio/clarification-form.ts`, `lib/studio/clarification-form.test.ts`
- Modify: `components/studio/prompt-composer.tsx`, `lib/studio/queries.ts` (`listStudioDrafts`, `StudioDraftSummary`), `components/studio/draft-list-item.tsx`, `hooks/use-generation-job.ts`, `components/studio/studio-workspace.tsx`, `locales/ko.po`, `locales/en.po` (extract 결과)

**Interfaces:**
- Consumes: Task 3 의 `resumeClarifiedJob`, `cancelClarifiedJob`, `GenerationJobView.clarification`
- Produces:
  - `clarification-form.ts`:
    - `type ClarificationChoice = { kind: 'option'; index: number } | { kind: 'custom'; text: string }`
    - `toClarificationAnswers(questions: GenerationClarificationQuestion[], choices: Record<string, ClarificationChoice | undefined>): GenerationClarificationAnswer[]`
      - option 은 그 보기 문장을 그대로 답으로 쓴다
      - custom 은 trim 한 글이 비지 않을 때만 답으로 쓴다
      - 범위 밖 index 는 버린다
      - 질문 순서대로
    - `canSubmitAnswers(answers: GenerationClarificationAnswer[]): boolean` (하나 이상)
  - `StudioDraftSummary.isAwaitingInput: boolean`: 그 초안에 awaiting_input 인 초안 작성 작업이 있는지. `exists` 하위 질의로 읽는다.
  - `ClarificationCard` props: `{ job: GenerationJobView; onResumed: (job: GenerationJobView) => void; onCancelled: () => void }`

- [ ] **Step 1: 실패하는 테스트** (`clarification-form.test.ts`)
  - 보기 선택 → 보기 문장
  - 직접 입력 공백만 → 제외
  - 범위 밖 index → 제외
  - 답하지 않은 질문 → 제외
  - 순서 유지
  - `canSubmitAnswers([])` false
- [ ] **Step 2:** 구현 후 `pnpm test lib/studio` 통과
- [ ] **Step 3:** `ClarificationCard` 를 만든다.
  - 머리: 카드 머리 문구와 `reason` 한 줄 (lucide `MessageCircleQuestion`)
  - 질문마다 `fieldset` + `legend`. 보기는 라디오이고, 마지막 라디오는 `직접 입력`. 고르면 `textarea` 가 열린다 (`maxLength={CLARIFICATION_ANSWER_MAX_LENGTH}`, 글자 수 표시).
  - 보기가 없는 질문은 라디오 없이 입력칸만 보여 준다.
  - 버튼: `답하고 작성` (주 버튼, `canSubmitAnswers` 가 거짓이면 disabled), `그냥 작성`, `취소`
  - 누르면 `useTransition` 으로 액션을 부르고, 진행 중에는 세 버튼을 모두 막는다.
  - 결과 처리:
    - `started` → `onResumed(job)`
    - `cancelled` → `onCancelled()`
    - `not_found` → 이미 처리된 질문 문구
    - `github_reauth`·`runner_unavailable` → `GENERATION_ERROR_MESSAGES` 의 같은 코드 문구
    - `invalid` → `답을 확인해 주세요.` / `Please check your answers.`
  - `job.clarification` 이 null 이면 질문 없이 머리와 `그냥 작성`·`취소`만 보여 준다.
  - 스타일:
    - 기존 `GenerationProgress` 의 글자 크기(11/12px)와 `studio-styles`·`button-styles` 를 재사용한다.
    - 모바일에서는 보기와 버튼을 세로로 쌓는다 (`flex-col`, `pc:flex-row`).
- [ ] **Step 4:** `prompt-composer.tsx` 를 고친다.
  - `job.status === 'awaiting_input'` 이면 `GenerationProgress` 자리에 `ClarificationCard` (`onResumed={onJobStarted}`, `onCancelled={onJobDismiss}`).
  - 제출 버튼은 awaiting_input 일 때 disabled 로 두되 스피너와 "작성하는 중" 문구는 보이지 않게 한다 (질문에 답하기 전에는 아무것도 작성하지 않음).
- [ ] **Step 5:** `listStudioDrafts` 에 `isAwaitingInput` 을 더하고, `draft-list-item.tsx` 의 상태 줄에 `· 답변 대기` 를 `text-brand` 로 덧붙인다. 작업이 진행 중에 awaiting_input 으로 바뀌면 목록에도 바로 보이도록 다음을 한다.
  - `useGenerationJob` 에 `onAwaitingInput` 콜백을 더해, 같은 작업에 한 번만 부르게 한다 (`notifiedJobIdRef` 와 같은 방식).
  - `studio-workspace.tsx` 에서 그 콜백으로 `router.refresh()` 를 부른다.
- [ ] **Step 6:** `pnpm i18n:extract` → en.po 의 새 msgid 를 Global Constraints 문구로 채운다 → `pnpm i18n:compile`
- [ ] **Step 7:** `pnpm test`, `pnpm typecheck`, `pnpm exec eslint <바꾼 파일>`
- [ ] **Step 8: 로컬 화면 확인** (`GENERATION_RUNNER=fake`, Browser pane, `.claude/launch.json` 의 dev 서버)
  - 요청 끝에 `[clarify]` 를 넣어 작성을 요청한다. 단계 표시 대신 카드가 뜨고 편집기가 잠기는지 본다.
  - 목록에 `답변 대기` 가 보이는지 본다.
  - 다른 초안으로 갔다가 돌아왔을 때 같은 카드가 다시 뜨는지 본다.
  - 첫 질문은 보기, 둘째 질문은 직접 입력으로 답하고 `답하고 작성`을 누른다. 1→2→3 진행 후 본문이 반영되는지 본다.
  - 새 요청으로 `그냥 작성` → 완료, 또 새 요청으로 `취소` → 카드가 닫히고 잠금이 풀리는지, 화면을 다시 열어도 취소 안내가 뜨지 않는지 본다.
  - 모바일 폭(375)에서 카드가 넘치지 않는지 본다.
  - 콘솔 오류가 없는지 본다.
  - 로컬 DB 에는 Task 1 마이그레이션이 필요하다. 로컬 적용(`db:migrate:local`)은 하기 전에 사용자에게 묻는다.
- [ ] **Step 9:** 커밋 `feat: 되묻기 질문 카드와 답변 대기 표시`

### Task 6: 계약 맞추기와 clarify 검증 (comdraft-lambda)

**Files:**
- Modify: `src/contract.ts`, `src/generation/schemas.ts`, `src/generation/validate.ts`, `src/generation/validate.test.ts`, `src/quota.test.ts`, 기존 테스트의 `Plan`/`RawPlan` 상수 (`src/pipeline.test.ts` 등, `clarify` 필드 추가)
- Create: `src/generation/clarify.ts`, `src/generation/clarify.test.ts`

**Interfaces:**
- Produces:
  - `contract.ts`:
    - `GenerationStatus` 에 `'awaiting_input'`, `GenerationErrorCode` 에 `'cancelled'`
    - `GenerationClarification*` 세 타입을 comdraft 와 같은 이름·형태로 둔다
  - `schemas.ts`:
    - `PlanSchema` 맨 앞에 `clarify: z.object({ needed: z.boolean(), reason: z.string(), questions: z.array(z.object({ question: z.string(), options: z.array(z.string()) })) })`
    - `export interface ClarifyRequest { reason: string; questions: GenerationClarificationQuestion[] }`
    - `Plan = Omit<RawPlan, 'linkRoles' | 'clarify'> & { linkRoles: LinkRoleEntry[]; clarify: ClarifyRequest | null }`
  - `clarify.ts`:
    - 상수 `CLARIFY_MAX_QUESTIONS = 3`, `CLARIFY_MAX_OPTIONS = 3`, `CLARIFY_MIN_OPTIONS = 2`, `CLARIFY_REASON_MAX = 200`, `CLARIFY_QUESTION_MAX = 200`, `CLARIFY_OPTION_MAX = 120`
    - `validateClarify(raw: RawPlan['clarify']): ClarifyRequest | null`
      - needed 가 false 면 null
      - 질문은 trim 후 빈 것을 버리고 앞에서 3개, 보기는 trim 후 빈 것을 버리고 앞에서 3개
      - 남은 보기가 2개 미만이면 `[]`
      - 각 문장은 상한 글자 수까지만 남긴다
      - 남은 질문이 0개면 null
      - id 는 `Q1`… 순서대로 붙인다
    - `parseJobClarification(value: unknown): GenerationClarification | null`: DB 의 jsonb. 문자열로 오면 JSON.parse 하고, 형식이 다르면 null.
    - `answeredPairs(clarification: GenerationClarification | null): { id: string; question: string; answer: string }[]`
      - answers 가 배열일 때만, 질문 id 와 맞는 답만, 질문 순서대로
      - 그 밖에는 `[]`
  - `validatePlan` 이 `clarify: validateClarify(plan.clarify)` 를 넣는다.

- [ ] **Step 1:** `git switch main && git pull --ff-only && git switch -c feat/clarifying-questions`
- [ ] **Step 2: 실패하는 테스트** (`clarify.test.ts`)
  - `묻지 않기로 하면 null`
  - `needed 인데 질문이 없으면 null`
  - `질문 4개째와 보기 4개째는 버린다`
  - `빈 문장은 버린다`
  - `보기가 1개면 직접 입력만 남긴다`
  - `id 는 남은 질문 순서대로 Q1 부터`
  - `긴 문장은 상한까지만`
  - `parseJobClarification` 정상·문자열 JSON·형식 오류
  - `answeredPairs`: skipped → `[]`, 모르는 id 제외, 질문 순서
  - `quota.test.ts`: `답변 대기 작업은 쓴 토큰만 센다`
  - `validate.test.ts`: `validatePlan 은 clarify 를 보정해 넣는다`
- [ ] **Step 3:** 구현하고, 기존 테스트 상수에 `clarify: { needed: false, reason: '', questions: [] }` (RawPlan) 또는 `clarify: null` (Plan) 을 더한다.
- [ ] **Step 4:** `pnpm test`, `pnpm typecheck`
- [ ] **Step 5:** 커밋 `feat: 기획 출력에 되묻기 판단(clarify) 추가와 검증`

### Task 7: 판단 규칙과 맥락 블록 프롬프트 (comdraft-lambda)

**Files:**
- Modify: `src/prompts/types.ts`, `src/prompts/render.ts`, `src/prompts/ko.ts`, `src/prompts/en.ts`, `src/prompts/prompts.test.ts`

**Interfaces:**
- Consumes: Task 6 의 `answeredPairs`, `JobContext.clarification` (Task 8 에서 채우지만 타입은 이 Task 에서 `jobs.ts` 의 `JobContext` 에 `clarification: GenerationClarification | null` 로 먼저 더한다. 기존 테스트 context 상수에도 `clarification: null` 추가)
- Produces:
  - `PromptPack.clarifyRuleMarker: string`
  - `render.ts`: `renderClarification(clarification: GenerationClarification | null): string`
    - 형식: `<clarification>` 안에 답한 쌍마다 `<qa id="Q1"><question>…</question><answer>…</answer></qa>`
    - 질문·답은 `escapeTagText` 를 거친다
    - 답한 쌍이 없으면 `''`
  - ko/en `plan`·`analyze`·`write`·`review`·`revise` user 프롬프트: `renderClarification` 이 비지 않으면 요청 블록 바로 뒤(write 는 옵션 줄 뒤)에 `## 작성자가 보탠 맥락` 블록을 넣는다.
  - plan user: `context.clarification` 이 null 이 아니면(이미 물었으면, 그냥 작성 포함) 다음 문장을 넣는다.
    - ko: `## 되묻기\n이 작업은 이미 작성자에게 물었다. clarify.needed 는 false 로 두고 위 입력으로 기획한다.`
    - en: 같은 뜻의 문장

- [ ] **Step 1: 실패하는 테스트** (`prompts.test.ts`, ko/en 모두)
  - `PLAN_SYSTEM 에 되묻기 규칙 표식이 있다`
  - `답한 쌍이 있으면 기획·분석·작성·검토·고쳐 쓰기 입력에 맥락 블록이 들어간다`
  - `그냥 작성이면 맥락 블록이 없고 기획 입력에 되묻기 완료 문장이 있다`
  - `처음 실행(clarification null)이면 맥락 블록도 되묻기 문장도 없다`
  - `답 안의 태그 문자는 이스케이프된다`
- [ ] **Step 2:** PLAN_SYSTEM(ko/en)에 `## 되묻기 판단 (clarify)` 절을 넣는다. 스펙 5.1~5.3 을 프롬프트 문장으로 옮긴다. 각 규칙에는 왜 그런지 짧게 덧붙인다.
  - 묻는 조건: 아래 둘을 모두 만족할 때만 묻는다.
    - 글의 중심이나 동기·겪은 문제를 메시지·diff·요청·링크 어디서도 알 수 없다.
    - 그 공백 때문에 기획이 서로 다른 글로 갈린다.
  - 묻지 않는 것: 세부 사실(빈칸의 몫), 소감, diff 로 추론할 수 있는 것. 요청이 충분하면 묻지 않는다.
  - 질문 쓰는 법:
    - 최대 3개, 서로 다른 면 (동기·문제 / 독자에게 남길 것 / 섞인 주제 중 중심)
    - 보기는 2~3개, 짧은 한 문장, 커밋 메시지와 diff 에 드러난 것으로만
    - 결과 언어로 쓴다
  - 묻더라도 목차는 평소처럼 기획한다 (스키마가 요구하고, 재실행 때 다시 기획하므로 이 목차는 쓰이지 않음).
  - 입력 형식 절에 `<clarification>` 줄을 더하고, `clarifyRuleMarker` 구절이 이 절에 그대로 들어가게 한다.
- [ ] **Step 3:** ANALYZE/WRITE/REVIEW/REVISE system 의 입력 형식 절에 `<clarification>` 을 설명하는 한 줄을 넣는다.
  - ko 예: "작성자가 질문에 답한 맥락. 요청과 같은 수준의 근거이며 근거 번호는 R 로 쓴다. 요청처럼 글에 옮겨 적을 문장은 아니다."
  - en 은 같은 뜻으로 쓴다.
  - 데이터-지시 분리 규칙의 태그 목록에도 `<clarification>` 을 더한다.
- [ ] **Step 4:** `pnpm test`, `pnpm typecheck`
- [ ] **Step 5:** 커밋 `feat: 되묻기 판단 규칙과 작성자 맥락 프롬프트`

### Task 8: 파이프라인과 작업 실행 (comdraft-lambda)

**Files:**
- Modify: `src/jobs.ts`, `src/pipeline.ts`, `src/placeholder-pipeline.ts`, `src/run-job.ts`, `src/pipeline.test.ts`, `src/run-job.test.ts`, run-job 테스트의 가짜 JobStore

**Interfaces:**
- Consumes: Task 6 의 `ClarifyRequest`, `parseJobClarification`, Task 7 의 `renderClarification`
- Produces:
  - `JobStore.pauseForInput(jobId: string, request: ClarifyRequest): Promise<boolean>`
    - 조건: `id = jobId and status = 'running' and clarification is null`
    - 바꾸는 값: `status = 'awaiting_input'`, `clarification = { reason, questions, answers: null }` (`sql.json`), `estimated_tokens = null`
    - step 은 그대로 둔다
  - `loadContext` 가 `p.clarification` 을 읽어 `parseJobClarification` (초안 작성 작업만, 빈칸 채우기는 null)
  - `Pipeline.clarification: (classified: C) => ClarifyRequest | null`
    - Claude 구현: `classified.plan.clarify`
    - placeholder: `() => null`
  - `classify` 규칙:
    - `askable = context.clarification === null`
    - 처음 기획의 `plan.clarify` 가 있고 askable 이면 replan 없이 바로 반환
    - askable 이 아니면 `plan.clarify = null` 로 바꾼다
    - replan 결과의 clarify 는 항상 null
  - 예상량: `requestTokens = estimateTokens(context.prompt) + estimateTokens(renderClarification(context.clarification))`
  - `RunJobOutcome` 에 `'awaiting_input'`
  - `runDraft` 반환: `{ kind: 'result'; markdown: string } | { kind: 'paused' } | null`. classify 직후, `advance(1)` 전에 `pipeline.clarification(classified)` 를 확인한다.
    - 값이 있으면 `pauseForInput`. true 면 `{ kind: 'paused' }`, false 면 null (cancelled).
    - paused 를 받은 바깥에서는 `notify('awaiting_input')` (step 0) 후 `'awaiting_input'` 을 반환한다. complete 는 부르지 않는다.

- [ ] **Step 1: 실패하는 테스트**
  - `pipeline.test.ts`:
    - `처음 실행에서 기획이 묻기로 하면 다시 기획하지 않고 clarify 를 돌려준다`: 필수 제목이 빠졌어도 llm.parse 호출 1회
    - `이미 물은 작업은 기획이 묻기로 해도 무시한다`: `clarification` 이 skipped
    - `다시 기획한 결과의 clarify 는 무시한다`
    - `답한 맥락이 분석·작성·검토 입력에 들어간다`: llm 호출 user 문자열에 `<clarification>` 이 있는지
    - `예상량에 답 길이가 들어간다`
  - `run-job.test.ts`:
    - `기획이 묻기로 하면 질문을 저장하고 답변 대기로 끝낸다`: pauseForInput 호출 인자, 신호 status `awaiting_input` step 0, markStep·complete 미호출, 결과 `'awaiting_input'`
    - `답변 대기로 바꾸지 못하면(그 사이 끝남) cancelled`
    - `재실행(clarification 있음)에서는 묻지 않고 완료한다`
- [ ] **Step 2:** 실패 확인 → 구현 → `pnpm test`, `pnpm typecheck`
- [ ] **Step 3:** `handler.ts` 가 outcome 을 그대로 돌려주는지 확인한다 (타입만 넓어짐).
- [ ] **Step 4:** 커밋 `feat: 기획이 묻기로 하면 답변 대기로 멈추고, 재실행에서 답을 반영`

### Task 9: 품질 비교 (실제 Claude, 커밋하지 않음)

**Files (git 에 넣지 않음, `.superpowers/` 는 `.git/info/exclude` 대상):**
- Create: `/Users/junmyeongjo/Workspace/comdraft/.superpowers/compare/tool/run.ts`, `check.py`, `run-cases.sh`, `cases/*.json`
- Output: `/Users/junmyeongjo/Workspace/comdraft/.superpowers/compare/rounds/r10/`

**Interfaces:**
- 이전 비교 도구는 임시 폴더에서 지워졌다. 이 세션 기록 `/Users/junmyeongjo/.claude/projects/-Users-junmyeongjo-Workspace-comdraft/c9b11b0f-2b00-4958-a896-c36925e4a6d9.jsonl` 에 원본이 남아 있다.
  - `run.ts`·`check.py` 는 Write 호출에, `run-cases.sh`·`cases/T1~T9` 는 Bash 호출에 있다.
  - 그 뒤 Edit 호출까지 차례로 적용한 마지막 판을 복구한다. 복구 스크립트는 scratchpad 에 둔다.
  - 경로 상수는 위 폴더 기준으로 바꾼다 (`before` 판은 쓰지 않으므로 빼도 된다).
- `run.ts` 입력에 더할 선택 필드:
  - `messages?: Record<string, string>`: sha 를 키로 커밋 메시지를 덮어씀 (부실한 메시지 흉내)
  - `clarification?: GenerationClarification`: 재실행 흉내
  - `planOnly?: boolean`: classify 까지만 실행
- trace 에 `clarify` (= `pipeline.clarification(classified)`) 를 기록한다. 값이 있고 `clarification` 입력이 없으면 기획에서 멈춘다.

- [ ] **Step 1:** 도구를 복구하고, 키 없이 실행해 "ANTHROPIC_API_KEY 가 없습니다" 로 멈추는지 확인한다.
- [ ] **Step 2:** 케이스를 추가한다.
  - `T10`: T1 입력 복사. 커밋 메시지를 차례로 `update`, `fix`, `update`… 로 덮고, 요청은 `블로그 글 써줘`.
  - `T11`: T2 입력 복사. 메시지 덮기는 같고, 요청도 `블로그 글 써줘`.
  - `T10a`: T10 + `clarification`. 질문과 보기는 T10 실행 결과에서 가져오고, 답은 첫 보기를 고른 것으로 한다.
- [ ] **Step 3:** **실행 전에 사용자에게 비용을 확인받는다.** T1~T11 은 planOnly(기획 1회씩), T10a 는 전체 실행이다. 키는 `ANTHROPIC_API_KEY="$(cat ~/.comdraft-compare-key)"` 처럼 환경 변수로만 넘기고 출력하지 않는다.
- [ ] **Step 4:** 판정 기준
  - T10: clarify 가 있고 질문 1~3개, 보기가 diff 에 드러난 내용에 근거한다 (직접 읽고 판단)
  - T11: clarify 없음
  - T1~T9: clarify 없음
  - T10a: 기획 takeaway 와 첫 절이 고른 답의 방향을 따르고, 결과 글에 답 문장을 그대로 옮긴 곳이 없다
- [ ] **Step 5:** 기준을 못 넘으면 Task 7 의 PLAN_SYSTEM 판단 규칙만 고쳐 다시 돌린다 (최대 2회). 결과 요약을 `rounds/r10/summary.md` 에 쓰고 사용자에게 보고한다.
- [ ] **Step 6:** 규칙을 고쳤다면 lambda 에 커밋 `fix: 되묻기 판단 기준 다듬기`

---

## 배포 순서 (이 계획 밖, 사용자 승인 단계)

1. 마이그레이션 `0020` 운영 적용: 사용자가 직접 한다.
2. comdraft 머지·배포: 이 시점의 Lambda 는 묻지 않으므로 화면 변화가 없다.
3. comdraft-lambda: terraform plan 을 보여 주고, 승인을 받은 뒤 apply 한다.
