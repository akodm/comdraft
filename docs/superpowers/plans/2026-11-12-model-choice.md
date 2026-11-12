# 등급별 모델 선택과 비용 기준 사용량 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** pro 는 Sonnet, max 는 Opus 까지 고를 수 있게 하고, 사용량을 실제 비용(마이크로달러)으로 세고 차감한다.

**Architecture:**
- **Lambda:** 단계마다 `stagePlan(고른 모델, 단계)` 로 모델과 사고 깊이를 정한다.
  - 분석은 항상 Haiku 다.
  - Sonnet·Opus 호출이 거절되면 그 단계만 Haiku 로 다시 부른다.
  - LLM 클라이언트는 응답마다 실제 모델 단가로 비용을 계산해 `{ tokens, cost }` 로 보고하고, 작업 저장소가 `used_tokens`·`used_cost` 에 더한다.
  - 예상량은 단계별 입력·출력 토큰에 단계 모델 단가를 곱한 비용으로 예약한다.
- **comdraft:**
  - 작업에 `model` 을 저장한다.
  - 등급별 허용 모델을 서버에서 검사한다.
  - 사용량 계산을 비용 컬럼으로 바꾸고, 기본 옵션 화면에 모델 줄을 추가한다.

**Tech Stack:** TypeScript (Node strip-types), node:test, @anthropic-ai/sdk / Next.js 16, drizzle, Lingui, vitest, Tailwind v4, Terraform

**Spec:** `docs/superpowers/specs/2026-11-12-model-choice-design.md`

## Global Constraints

### 저장소와 실행 환경

- 저장소와 브랜치 (worktree 를 만들지 않는다):
  - Task 1~3: `/Users/junmyeongjo/Workspace/comdraft-lambda` 의 `feat/model-choice` (Task 1 에서 `main` 에서 만든다)
  - Task 4~6: `/Users/junmyeongjo/Workspace/comdraft` 의 `feat/model-choice` (이미 있음)
  - Task 7: 두 저장소 모두
- 셸 명령 앞에 `export PATH=/Users/junmyeongjo/.nvm/versions/node/v24.12.0/bin:$PATH;` 를 붙인다.
- 검사 명령:
  - lambda: `pnpm test`, `pnpm typecheck`. lambda 저장소에는 prettier 를 돌리지 않는다.
  - comdraft: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm exec eslint <바꾼 파일>`

### 하지 않는 것

- `db:migrate*` (로컬 적용은 사용자에게 묻는다), `terraform apply`, `git push`
- API 키(`~/.comdraft-compare-key`)를 출력하거나 명령줄에 그대로 쓰는 것

### 코드 규칙

- 주석과 테스트 이름은 한국어로, 기존 말투를 따른다. 디버그 `console` 은 남기지 않는다.
- 화면은 테일윈드 v4, 아이콘은 lucide 로 짓는다. 프로젝트 관례대로 `public/images/studio/` 의 정적 SVG 를 쓴다.
- 문구는 Lingui 로 쓰고, `pnpm i18n:extract` 후 en.po 를 채우고 `pnpm i18n:compile` 한다.
- 커밋 메시지는 빈 줄 뒤 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` 로 끝낸다.

### 고정 값 (스펙 그대로)

- **모델 값:** `GENERATION_MODELS = ['haiku', 'sonnet', 'opus'] as const`
  - ID: `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`
  - 기본값 `haiku`
- **등급별 허용:** `basic: ['haiku']`, `pro: ['haiku','sonnet']`, `max: ['haiku','sonnet','opus']`. 모르는 등급은 `['haiku']`.
- **단가 (100만 토큰당 달러 = 토큰 1개당 마이크로달러):**

  | 모델 | 입력 | 출력 | 캐시 쓰기 | 캐시 읽기 |
  |---|---|---|---|---|
  | haiku (기본 구간) | 0.10 | 0.50 | 0.125 | 0.01 |
  | haiku (프롬프트 10만 토큰 초과 호출) | 0.50 | 2.50 | 0.625 | 0.05 |
  | sonnet | 2 | 10 | 2.50 | 0.10 |
  | opus | 4 | 20 | 5 | 0.20 |

  - "프롬프트" = input + cache_creation + cache_read 이다.
  - 캐시 쓰기 단가는 입력의 1.25배(5분 캐시)로 잡았다. Task 1 에서 claude-api 스킬의 `shared/live-sources.md` Pricing 페이지로 확인하고, 다르면 공식 값을 쓴다.
- **비용 = 토큰 × 단가 합의 올림 (호출 하나 단위).** 정수 마이크로달러이고, DB 는 `bigint` (drizzle `mode: 'number'`) 다.
- **단계별 모델·사고 깊이:**

  | 단계 | haiku | sonnet·opus |
  |---|---|---|
  | plan (replan 포함) | haiku medium | 고른 모델 low |
  | analyze | haiku medium | **haiku medium** |
  | write | haiku high | 고른 모델 medium |
  | review | haiku medium | 고른 모델 low |
  | revise | haiku high | 고른 모델 medium |
  | fill | haiku medium | 작업 모델 low |

  - 거절 재시도는 그 단계의 haiku 사고 깊이로 한다.
- **Lambda 제한:** 720초. `GENERATION_LAMBDA_TIMEOUT_MS = 12 * 60 * 1000` (양쪽 contract), terraform `lambda_timeout_seconds` default 720.
- **호출 하나당 제한:** `LLM_TIMEOUT_MS_BY_MODEL`.
  - 시작 값 haiku 180_000 / sonnet 240_000 / opus 300_000
  - Task 7 실측으로 다시 정한다.
- **주간 한도 `weekly_cost_limit`:** basic 300_000 / pro 6_000_000 / max 18_000_000. Task 7 실측으로 다시 계산한다.
- **기존 작업 비용 채우기:** `used_cost = ceil(used_tokens * 0.26)`, `estimated_cost = ceil(estimated_tokens * 0.26)` (null 은 null).
- **화면 배율 `MODEL_USAGE_RATIO`:** `{ haiku: 1, sonnet: 10, opus: 20 }` 를 시작 값으로 두고 Task 7 에서 맞춘다.
- **문구 ko / en:**

  | 쓰는 곳 | ko | en |
  |---|---|---|
  | 줄 이름 | `모델` | `Model` |
  | 기본 표시 | `기본` | `Default` |
  | 배율 표시 | `사용량 약 {ratio}배` | `About {ratio}× usage` |
  | 잠금 (Pro) | `Pro 이상` | `Pro and up` |
  | 잠금 (Max) | `Max` | `Max` |
  | 모델 줄 아래 안내 | `높은 모델일수록 이번 주 사용량이 빨리 줄어듭니다.` | `Higher models use up this week's allowance faster.` |
  | `model_locked` 안내 | `이 모델은 현재 등급에서 쓸 수 없습니다.` | `This model isn't available on your current plan.` |

## 스펙에서 정한 세부 (판정)

- **예상량 범위:** 검토·고쳐 쓰기는 지금처럼 예상량에 넣지 않고 실제 사용량으로만 센다.
  - 이유: 스펙 4.2 는 "단계별로 나눈다"만 정했다. 지금 동작(검토는 덤)을 바꾸면 Haiku 사용자의 예약이 커진다.
  - 단계별 분리의 합은 기존 `estimateJobTokens` 의 합과 같아야 한다 (테스트로 고정).
- **`parsePromptOptions` 의 `model`:** 없으면 `haiku` 로 채운다. 저장된 옛 작업이나 옛 화면이 보내는 요청도 받기 위해서다.
  - 값이 있는데 목록 밖이면 지금처럼 null(거부)이다.
- **등급 판정:** `session.user.role` 로 한다 (better-auth 추가 필드). 빈칸 채우기의 모델 낮추기도 같은 함수를 쓴다.

## Review Focus

1. **Haiku 10만 토큰 초과 구간:** 한 호출의 프롬프트가 100_000 을 넘으면 그 호출의 모든 토큰이 비싼 구간 단가로 계산돼야 한다. 경계값 100_000 은 기본 구간이다 → Task 1 `usageCost` 테스트.
2. **거절 재시도:**
   - 거절된 Sonnet 호출의 토큰은 Sonnet 단가로, 재시도는 Haiku 단가로 각각 기록돼야 한다.
   - Haiku 도 거절하면 `llm_failed` 다.
   - Haiku 를 고른 작업의 거절은 재시도하지 않는다.
   → Task 2 테스트.
3. **옛 데이터와 옛 요청:**
   - `model` 이 없는 요청은 haiku 로 처리한다.
   - DB 의 모르는 모델 값은 Lambda 에서 haiku 로 처리한다.
   - 저장된 모델을 지금 등급에서 쓸 수 없으면 쓸 수 있는 가장 높은 모델로 낮춘다.
   → Task 3·5 테스트.
4. **배포 사이 기간:** 새 Lambda + 옛 Next.js 에서 옛 Next.js 가 만든 작업은 `model` 기본값 haiku 로 실행되고, `used_tokens` 와 `used_cost` 가 함께 쌓여야 한다 → Task 3 `addUsage` 테스트, Task 4 마이그레이션 기본값.
5. **Opus 예상량의 분석 단계:** 분석은 Haiku 단가로 들어가야 하고, 예상량이 남은 양 × 허용 비율을 넘으면 `quota_exceeded` 이며 사용량은 0 이다 → Task 3 예상량 테스트.

---

### Task 1: 모델·단가·단계 계획 (comdraft-lambda)

**Files:**
- Modify: `src/contract.ts`
- Create: `src/generation/models.ts`, `src/generation/models.test.ts`

**Interfaces:**
- Produces:
  - `contract.ts`:
    - `GENERATION_MODELS`, `type GenerationModel`
    - `GENERATION_MODEL_IDS: Record<GenerationModel, string>`
    - `GENERATION_LAMBDA_TIMEOUT_MS = 12 * 60 * 1000` (있으면 값 변경, 없으면 추가하고 쓰는 곳 확인)
    - `isGenerationModel(value: unknown): value is GenerationModel`
  - `models.ts`:
    - `type Stage = 'plan' | 'analyze' | 'write' | 'review' | 'revise' | 'fill'`
    - `interface StageCall { model: GenerationModel; effort: Effort; fallback: { model: 'haiku'; effort: Effort } | null }`
    - `stagePlan(selected: GenerationModel, stage: Stage): StageCall`
      - Global Constraints 표대로 정한다.
      - `fallback` 은 실제 호출 모델이 haiku 가 아닐 때만 `{ model: 'haiku', effort: <그 단계 haiku 사고 깊이> }`, 아니면 null 이다.
    - `interface UsageTokens { input: number; output: number; cacheWrite: number; cacheRead: number }`
    - `MODEL_PRICES` (Global Constraints 단가, haiku 는 `base`·`long` 두 구간)
    - `HAIKU_LONG_PROMPT_TOKENS = 100_000`
    - `usageCost(model: GenerationModel, usage: UsageTokens): number`: 마이크로달러, 올림
    - `toModel(value: unknown): GenerationModel`: 모르는 값은 `'haiku'`

- [ ] **Step 1:** `git switch main && git pull --ff-only && git switch -c feat/model-choice`
- [ ] **Step 2:** 캐시 쓰기 단가를 공식 가격 페이지로 확인한다 (claude-api 스킬 `shared/live-sources.md` 의 Pricing 행). 다르면 공식 값을 쓰고 보고서에 남긴다.
- [ ] **Step 3: 실패하는 테스트** (`models.test.ts`)
  - `분석은 어떤 모델을 골라도 haiku medium`
  - `sonnet·opus 는 단계마다 haiku 보다 한 단계 낮다` (표 전체)
  - `haiku 를 고르면 거절 재시도가 없다`
  - `sonnet 작성 단계의 재시도는 haiku high`
  - `usageCost`:
    - haiku 1_000 입력 + 1_000 출력 → `600`
    - opus 같은 양 → `24_000`
    - 캐시 읽기·쓰기 포함
    - 프롬프트 100_000 은 기본 구간, 100_001 은 long 구간
    - 소수점 올림 (haiku 입력 1 토큰 → 1)
  - `toModel` 은 모르는 값과 undefined 를 haiku 로
- [ ] **Step 4:** 구현 → `pnpm test`, `pnpm typecheck`
- [ ] **Step 5:** 커밋 `feat: 모델 목록·단가·단계별 모델 계획`

### Task 2: LLM 클라이언트의 모델·거절 재시도·비용 보고 (comdraft-lambda)

**Files:**
- Modify: `src/generation/llm.ts`, `src/generation/llm.test.ts`, LlmClient 를 흉내 내는 테스트 도우미 (`src/pipeline.test.ts`, `src/fill.test.ts` 의 fake llm)

**Interfaces:**
- Consumes: Task 1 `StageCall`, `usageCost`, `GENERATION_MODEL_IDS`
- Produces:
  - `type UsageReport = { tokens: number; cost: number }`
  - `type OnUsage = (usage: UsageReport) => void | Promise<void>`
  - `LlmClient.parse/write` 요청에서 `effort` 를 빼고 `call: StageCall` 을 받는다. 나머지 필드는 그대로다.
  - `LLM_TIMEOUT_MS_BY_MODEL: Record<GenerationModel, number>` (Global Constraints 시작 값). 호출 기한 계산(`callBudget`)은 그 호출 모델의 값을 쓴다.
  - 동작:
    1. `call.model` 로 호출한다.
    2. 응답을 받으면 `onUsage({ tokens: sumUsage(usage), cost: usageCost(model, toUsageTokens(usage)) })` 를 부른다.
    3. `stop_reason === 'refusal'` 이고 `call.fallback` 이 있으면 fallback 으로 한 번 더 호출한다 (사용량 보고도 같은 규칙).
    4. fallback 이 없거나 fallback 도 거절하면 지금처럼 `llm_failed` 다.

- [ ] **Step 1: 실패하는 테스트** (`llm.test.ts`, 기존 SDK 흉내 방식을 따른다)
  - `고른 모델 ID 로 호출한다`
  - `응답마다 토큰과 비용을 함께 보고한다`
  - `sonnet 이 거절하면 haiku 로 한 번 더 부르고, 두 호출을 각자 단가로 보고한다`
  - `haiku 재시도도 거절하면 llm_failed`
  - `fallback 이 없는 호출의 거절은 바로 llm_failed`
  - `opus 호출의 기한은 opus 제한을 쓴다`
- [ ] **Step 2:** 구현. 기존 `GENERATION_MODEL` 상수는 지우고 쓰는 곳을 모두 바꾼다. 아직 pipeline·fill 이 컴파일되지 않으면 이 Task 에서 `stagePlan('haiku', …)` 로 임시 연결해 기존 동작을 유지한다 (Task 3 에서 고른 모델로 바꾼다).
- [ ] **Step 3:** `pnpm test`, `pnpm typecheck`
- [ ] **Step 4:** 커밋 `feat: LLM 호출에 모델 선택·거절 시 Haiku 재시도·비용 보고`

### Task 3: 작업 모델·비용 기록·예상량·시간 제한 (comdraft-lambda)

**Files:**
- Modify:
  - `src/jobs.ts`, `src/quota.ts`, `src/generation/estimate.ts`, `src/pipeline.ts`, `src/fill.ts`, `src/run-job.ts`
  - `src/generation/limits.ts` (검토·고쳐 쓰기 남은 시간 기준을 모델 제한에 맞춤)
  - `infra/variables.tf` (default 720)
- Test: 각 파일의 `*.test.ts`

**Interfaces:**
- Consumes: Task 1·2
- Produces:
  - `JobContext.model: GenerationModel`
    - `loadContext` 가 `p.model` 을 읽어 `toModel` 한다.
    - 테스트 fixture 에는 `model: 'haiku'` 를 넣는다.
  - `JobStore.addUsage(jobId: string, usage: UsageReport): Promise<void>`: `used_tokens += tokens, used_cost += cost`, 둘 다 0 이하면 무시
  - `JobStore.reserveQuota(jobId, estimateCost: number)`:
    - `estimated_cost` 를 기록한다.
    - 정책은 `weekly_cost_limit` 를 읽는다.
    - 다른 작업 사용량은 `estimated_cost`·`used_cost` 로 센다.
  - `quota.ts`:
    - `QuotaJob = { status; estimatedCost: number | null; usedCost: number; errorCode }`
    - `QuotaPlan.weeklyCostLimit`
  - `pauseForInput` 은 `estimated_tokens` 와 함께 `estimated_cost` 도 비운다.
  - `estimate.ts`:
    - `estimateStages(prepared, length, systemTokens): { plan: Io; analyze: Io; write: Io }`, `type Io = { input: number; output: number }`
      - plan: input = `system.plan + request + catalog + link`, output = `PLAN_OUT`
      - analyze: input = `system.analyze + request + PLAN_OUT + min(hunk, HUNK_TOKEN_BUDGET)`, output = `ANALYSIS_OUT`
      - write: input = `system.write + request + ANALYSIS_OUT`, output = `WRITE_OUT[length]`
      - 세 단계 input+output 합 = 기존 `estimateJobTokens` 값 (테스트로 고정)
    - `estimateJobCost(stages, model): number`: 단계마다 `stagePlan(model, stage).model` 단가로 `usageCost` 를 계산해 합한다.
    - `estimateFillCost(promptTokens, model): number`
  - `pipeline.ts`·`fill.ts`: 단계마다 `stagePlan(context.model, stage)` 를 llm 에 넘기고, `estimate` 는 비용을 돌려준다. 기존 `*_STAGE` effort 상수는 `stagePlan` 으로 대체하고 maxTokens 만 남긴다.
  - `run-job.ts`: `onUsage` 가 `UsageReport` 를 `addUsage` 로 넘긴다.

- [ ] **Step 1: 실패하는 테스트**
  - `estimate.test.ts`:
    - `단계 분리 합이 기존 예상량과 같다`
    - `opus 예상량은 분석을 haiku 단가로 센다`
    - `haiku 예상량 < sonnet < opus`
  - `quota.test.ts`: 비용 컬럼 기준 `getJobUsage` (진행 중은 max, 답변 대기·완료는 used, quota_exceeded 는 0)
  - `pipeline.test.ts`:
    - `sonnet 작업은 기획·작성·검토·고쳐 쓰기를 sonnet 으로, 분석을 haiku 로 부른다` (fake llm 이 받은 `call` 확인)
    - `haiku 작업은 지금과 같은 사고 깊이`
  - `fill.test.ts`: `opus 작업의 빈칸 채우기는 opus low`
  - `run-job.test.ts`:
    - `응답마다 토큰과 비용이 addUsage 로 기록된다`
    - `답변 대기로 멈추면 예상 비용도 비운다`
  - `jobs.ts` 의 SQL 은 기존 테스트 방식대로 확인한다 (SQL 문자열 테스트가 없으면 타입과 run-job 테스트로 대신하고 보고서에 적는다).
- [ ] **Step 2:** 구현
  - `infra/variables.tf` 의 `lambda_timeout_seconds` default 를 720 으로, 설명도 맞춘다.
  - `limits.ts` 의 `REVIEW_MIN_REMAINING_MS`·`REVISE_MIN_REMAINING_MS` 는 지금 의미(호출 하나 제한 + 여유)를 유지하며, 고른 모델의 `LLM_TIMEOUT_MS_BY_MODEL` 로 계산하는 함수로 바꾼다.
- [ ] **Step 3:** `pnpm test`, `pnpm typecheck`
- [ ] **Step 4:** 커밋 `feat: 작업 모델로 단계를 실행하고 사용량을 비용으로 기록·예약`

### Task 4: 계약·스키마·마이그레이션·비용 사용량 (comdraft)

**Files:**
- Modify:
  - `lib/generation/contract.ts`
  - `lib/db/schema/draft.ts`, `lib/db/schema/quota.ts`
  - `lib/generation/quota.ts`, `lib/generation/quota.test.ts`, `lib/generation/quota-queries.ts`
- Create: `drizzle/0021_*.sql` (+ meta), `lib/generation/models.ts`, `lib/generation/models.test.ts`

**Interfaces:**
- Produces:
  - `contract.ts`:
    - Task 1 과 같은 `GENERATION_MODELS`, `GenerationModel`, `GENERATION_MODEL_IDS`, `isGenerationModel`
    - `GENERATION_LAMBDA_TIMEOUT_MS = 12 * 60 * 1000`
  - `lib/generation/models.ts`:
    - `MODEL_PRICES`, `usageCost` (Task 1 과 같은 값·규칙, 가짜 작성기가 씀)
    - `ROLE_MODELS: Record<string, GenerationModel[]>`
    - `getAllowedModels(role: string | null | undefined): GenerationModel[]`
    - `isModelAllowed(role, model): boolean`
    - `clampModel(role, model): GenerationModel` (쓸 수 없으면 허용 목록의 가장 높은 모델)
    - `MODEL_USAGE_RATIO`
  - `draft.ts`:
    - `model: text('model').$type<GenerationModel>().default('haiku').notNull()` + `check('draft_prompt_model_check', model in (...))`
    - `usedCost: bigint('used_cost', { mode: 'number' }).default(0).notNull()`
    - `estimatedCost: bigint('estimated_cost', { mode: 'number' })`
  - `quota.ts` (schema): `weeklyCostLimit: bigint('weekly_cost_limit', { mode: 'number' }).default(0).notNull()`
  - `lib/generation/quota.ts`:
    - `QuotaJob = { status; estimatedCost; usedCost; errorCode }`
    - `QuotaPlan.weeklyCostLimit`
    - `summarizeQuota` 의 `limit` 은 `weeklyCostLimit`
    - `quota-queries.ts` 는 비용 컬럼을 고른다.

- [ ] **Step 1: 실패하는 테스트**
  - `models.test.ts`:
    - 등급별 허용 목록, 모르는 등급은 haiku 만
    - `clampModel('pro', 'opus') === 'sonnet'`, `clampModel('basic', 'sonnet') === 'haiku'`
    - `usageCost` 는 Task 1 과 같은 예시 값
  - `quota.test.ts`: 기존 테스트를 비용 필드로 바꾸고 규칙을 그대로 확인한다.
- [ ] **Step 2:** 구현 후 `pnpm db:generate`. 만들어진 SQL 을 손으로 고친다.
  1. 컬럼 추가 (`weekly_cost_limit` 은 default 0)
  2. `--> statement-breakpoint` 를 두고 UPDATE 를 붙인다:
     - `update "comdraft"."draft_prompt" set "used_cost" = ceil("used_tokens" * 0.26), "estimated_cost" = case when "estimated_tokens" is null then null else ceil("estimated_tokens" * 0.26) end;`
     - `update "comdraft"."quota_plan" set "weekly_cost_limit" = case "role" when 'basic' then 300000 when 'pro' then 6000000 when 'max' then 18000000 else 300000 end;`
  3. 마지막에 `alter table "comdraft"."quota_plan" add constraint "quota_plan_cost_limit_check" check ("weekly_cost_limit" > 0);`
     - 이 check 는 schema 의 `check(...)` 로도 선언해 다음 generate 에서 다시 생기지 않게 한다. 순서상 SQL 의 위치만 바꾼다.

  다른 테이블이 바뀌었으면 멈추고 보고한다.
- [ ] **Step 3:** `pnpm test`, `pnpm exec tsc --noEmit`. 타입 오류가 Task 5 범위(액션·가짜 작성기)에서 나면 최소한으로 고쳐 컴파일만 맞춘다.
- [ ] **Step 4:** 커밋 `feat: 작업 모델·비용 컬럼과 비용 기준 사용량`

### Task 5: 옵션 검증·등급 검사·작성 요청·가짜 작성기 (comdraft)

**Files:**
- Modify:
  - `lib/studio/options.ts`
  - `lib/actions/generation.ts`, `lib/generation/jobs.ts` (`getLatestDraftJobOptions` 에 model)
  - `lib/generation/fake-runner.ts` (+ `fake-simulation.ts` 필요 시)
  - `lib/studio/queries.ts`
  - `app/[lang]/dashboard/repositories/[repositoryId]/drafts/page.tsx`, `.../[draftId]/page.tsx`
- Test: `lib/studio/options.test.ts` (없으면 생성)

**Interfaces:**
- Consumes: Task 4 `getAllowedModels`, `isModelAllowed`, `clampModel`, `usageCost`
- Produces:
  - `PromptOptions.model: GenerationModel`, `DEFAULT_PROMPT_OPTIONS.model = 'haiku'`
  - `parsePromptOptions`: model 이 없으면 haiku, 목록 밖이면 null
  - `RequestDraftGenerationResult` 에 `{ status: 'model_locked' }` 추가
    - `requestDraftGeneration` 은 `isModelAllowed(user.role, options.model)` 이 거짓이면 작업을 만들지 않고 `model_locked` 를 돌려준다.
    - 통과하면 `createJob` 이 `model` 을 저장한다.
  - `prepareFillJob` 은 최근 초안 작성 작업의 model 을 `clampModel(user.role, model)` 해 빈칸 작업에 저장한다.
  - `StudioDraft.promptOptions.model` 은 저장된 모델을 사용자 등급으로 `clampModel` 한 값이다.
  - 두 스튜디오 페이지가 `allowedModels: GenerationModel[]` 을 `StudioWorkspace` 에 넘긴다 (새 prop).
  - 가짜 작성기:
    - 완료 시 `completeJob(jobId, result, usedTokens, usedCost)` 를 부른다.
    - 비용은 `usageCost(job.model, { input: 20_000, output: 10_000, cacheWrite: 0, cacheRead: 0 })`, 빈칸 채우기는 input 2_000 / output 1_000 이다.
    - `completeJob` 시그니처에 `usedCost?: number` 를 추가한다.

- [ ] **Step 1: 실패하는 테스트** (`options.test.ts`)
  - `model 이 없으면 haiku 로 채운다`
  - `모르는 model 은 거부한다`
  - `sonnet 은 그대로 받는다`
- [ ] **Step 2:** 구현. `session.user.role` 타입이 추론되지 않으면 `lib/auth` 의 additionalFields 추론을 확인하고, 필요한 만큼만 타입을 보강한다.
- [ ] **Step 3:** `pnpm test`, `pnpm exec tsc --noEmit`, eslint
- [ ] **Step 4:** 커밋 `feat: 작성 요청의 모델 검증과 등급별 허용 검사`

### Task 6: 모델 줄 화면 (comdraft)

**Files:**
- Modify:
  - `components/studio/prompt-options.tsx`, `components/studio/studio-workspace.tsx`, `components/studio/prompt-composer.tsx` (`model_locked` 안내)
  - `locales/*.po`, `locales/*.ts`
- Create: `public/images/studio/lock.svg` (lucide `lock` 경로, 기존 SVG 처럼 색 지정)

**Interfaces:**
- Consumes: Task 5 `allowedModels`, `PromptOptions.model`, `model_locked`; Task 4 `MODEL_USAGE_RATIO`
- Produces:
  - `PromptOptions` props 에 `allowedModels: GenerationModel[]`
  - 모델 라디오 그룹:
    - 라벨: `Haiku · 기본`, `Sonnet · 사용량 약 {ratio}배`, `Opus · 사용량 약 {ratio}배`
    - 쓸 수 없는 모델은 `disabled` + 자물쇠 + `Pro 이상` / `Max`
    - 그룹 아래 안내 한 줄
  - 요약 줄에 모델 이름을 붙인다 (`… · Sonnet`)
  - `model_locked` 결과는 작성 요청 안내 자리에 Global Constraints 문구로 보여 준다.

- [ ] **Step 1:** 기존 `RadioGroup` 이 비활성 항목·보조 문구를 받지 못하면 선택 prop 으로 넓힌다. 다른 줄의 모습은 바뀌지 않아야 한다.
- [ ] **Step 2:** 구현, `pnpm i18n:extract` → en.po 채우기 → `pnpm i18n:compile`
- [ ] **Step 3:** `pnpm test`, `pnpm exec tsc --noEmit`, eslint
- [ ] **Step 4: 로컬 화면 확인**
  - 로컬 DB 마이그레이션이 필요하므로 적용 전에 사용자에게 묻는다.
  - 내 등급을 basic / pro / max 로 바꿔 가며 확인한다:
    - 모델 줄, 잠금 표시, 요약
    - 고른 모델이 초안을 다시 열어도 유지되는지
    - pro 로 opus 요청을 강제로 보냈을 때 `model_locked`
    - 375px 폭
  - 등급 변경은 로컬 DB `update comdraft."user" set role=...` 이고, 사용자 확인 뒤에 한다.
- [ ] **Step 5:** 커밋 `feat: 기본 옵션에 모델 선택 줄`

### Task 7: 실측과 최종 값 (두 저장소)

**Files:**
- Modify:
  - 비교 도구 `/Users/junmyeongjo/Workspace/comdraft/.superpowers/compare/tool/run.ts` (입력 `model?: GenerationModel` → `context.model`, trace 에 호출별 model·cost)
  - lambda `src/generation/llm.ts` (`LLM_TIMEOUT_MS_BY_MODEL`)
  - comdraft `lib/generation/models.ts` (`MODEL_USAGE_RATIO`)
  - comdraft 의 Task 4 마이그레이션 SQL 한도 값

- [ ] **Step 1:** run.ts 를 고친다. 키 없이 실행하면 키 오류로 멈추는지 확인한다.
- [ ] **Step 2:** **실행 전에 사용자에게 비용 승인을 받는다** (예상 2~4달러).
  - 케이스: T2(짧은 글), T5(긴 글)
  - 모델: sonnet, opus
  - 각 1회 전체 실행
- [ ] **Step 3:** 실측으로 값을 정한다.
  - 기록: 호출별 시간·비용, 한 편 비용, 글 품질(이전 Haiku 결과와 나란히 읽고 판단)
  - `LLM_TIMEOUT_MS_BY_MODEL`: 모델별 가장 긴 호출 × 2, 30초 단위 올림, 최대 300_000
  - `MODEL_USAGE_RATIO`: (모델 평균 한 편 비용 / Haiku 평균 한 편 비용)을 반올림한 정수. Haiku 평균은 r9·r10 기록을 쓴다.
  - 한도:
    - basic = Haiku 평균 × 10
    - pro = Sonnet 평균 × 10
    - max = Opus 평균 × 15
    - 각각 마이크로달러로 10_000 단위 올림
  - 결과를 `.superpowers/compare/rounds/r11/summary.md` 에 쓴다.
- [ ] **Step 4:** 값을 반영하고 두 저장소 테스트·타입 검사를 다시 돌린다. 커밋:
  - lambda `chore: 실측으로 모델별 호출 시간 제한 정하기`
  - comdraft `chore: 실측으로 모델 배율과 주간 한도 정하기`

---

## 배포 순서 (이 계획 밖, 사용자 승인 단계)

1. 마이그레이션 `0021`: 운영 적용은 사용자가 한다.
2. comdraft-lambda: PR 머지 → main 기준 terraform plan 확인 → apply (코드 + 시간 제한 720초)
3. comdraft: PR 머지 (Vercel 운영 배포)
