# 빈칸 AI 채우기와 블로그 글 프롬프트 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 빈칸을 AI 추가 요청 칸으로 바꾸고(다듬기·그대로 넣기·지우기), 다시 작성 경고를 넣고, 초안 프롬프트를 블로그 글답게 고친다.

**Architecture:**
- `draft_prompt` 에 작업 종류(`kind`: draft/fill)와 빈칸 채우기 컬럼, 초안 작성 분석 결과(`analysis`)를 더한다. 빈칸 채우기는 같은 작업 흐름(할당량, Realtime, 상태 조회, Lambda)을 쓴다.
- Next.js 가 요청 시점에 본문을 Markdown 으로 바꿔(대상 빈칸 자리 표시) 작업에 저장하고, Lambda 는 그 본문과 최근 분석 결과로 Claude 를 한 번 불러 문단을 만든다.
- 편집기는 결과를 빈칸 id 로 찾아 그 자리만 바꾼다. 빈칸 채우기 작업은 편집기 전체를 잠그지 않는다.

**Tech Stack:** comdraft (Next.js 16, Drizzle, Tiptap 3.33, Lingui, Vitest), comdraft-lambda (Node 22, postgres, Anthropic SDK, node:test)

**Spec:** `docs/superpowers/specs/2026-11-11-blank-fill-and-prompt-design.md`

## Global Constraints

- 작업 위치: comdraft `/Users/junmyeongjo/Workspace/comdraft` 의 `feat/blank-fill`, comdraft-lambda `/Users/junmyeongjo/Workspace/comdraft-lambda` 의 `feat/blank-fill`. worktree 쓰지 않음.
- pnpm 11: 모든 셸 명령 앞에 `export PATH=/Users/junmyeongjo/.nvm/versions/node/v24.12.0/bin:$PATH;`.
- comdraft 검증: `pnpm test && pnpm exec tsc --noEmit && pnpm exec eslint . --ext .ts,.tsx,.js,.jsx` (eslint `--fix` 를 무심코 돌리지 않음, `@/` import 유지).
- comdraft-lambda 검증: `pnpm test && pnpm typecheck && pnpm build`.
- 구현자는 `db:migrate*` 를 실행하지 않는다 (컨트롤러가 적용).
- 값:
  - 작업 종류 `'draft' | 'fill'`, 기본 `'draft'`
  - 답 길이 1~1,000자 (`MAX_BLANK_ANSWER_LENGTH = 1000`)
  - 빈칸 상한: short 1, medium 2, long 3 (`BLANK_LIMIT`)
  - 빈칸 채우기 출력 여유분 1,500 토큰 (`ESTIMATE_FILL_OUTPUT = 1_500`), 출력 문단 1~3개
  - 빈칸 id 는 UUID
- 문구 (ko, en 번역 채움):
  - 버튼: "AI 로 다듬기", "그대로 넣기", "지우기"
  - 다듬는 중: "AI 가 다듬는 중이에요"
  - 답 길이 초과: "답은 1,000자까지 적을 수 있습니다"
  - 실패: "빈칸을 다듬지 못했습니다. 다시 시도해 주세요." (할당량 소진·정책 없음·시간당 제한은 기존 문구 재사용)
  - 다시 작성 확인: 제목 "초안을 다시 작성할까요?", 설명 "새로 작성하면 지금 본문이 AI 결과로 바뀝니다. 직접 고친 내용도 사라집니다.", 버튼 "다시 작성", "취소"
- 프롬프트는 ko.ts 와 en.ts 를 같은 구조로 함께 바꾼다.
- 주석은 한국어, 디버그 console 금지, Tailwind v4 문자열 그대로.
- 커밋: 한국어 제목, 빈 줄, `- ` 본문, 빈 줄, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **빈칸 채우기가 편집기 전체를 잠그지 않는가**: 잠금 판정(`lockingJobExists`, `isJobLocking`, 편집 잠금 훅)이 `kind='draft'` 작업만 보는지 (Task 3, 4).
2. **결과가 엉뚱한 자리에 들어가지 않는가**: 빈칸 id 로만 찾고, 없으면 아무것도 바꾸지 않음 (Task 2, 3, 4).
3. **새로고침 후 이어 보기**: 진행 중 빈칸 채우기가 그 빈칸만 다시 잠그고, 떠난 사이 완료·실패가 맞게 처리됨 (Task 3, 4).
4. **답을 통한 인젝션**: 답은 태그로 감싼 데이터로만 쓰이고, 결과는 조립 단계와 같은 정리를 거침 (Task 6).
5. **프롬프트에 커밋 출처가 남지 않는가**: `{{commit:…}}` 가 사라지고 조립 단계도 커밋을 넣지 않음 (Task 5).

---

### Task 1: 작업 종류와 빈칸 채우기 컬럼 (comdraft)

**Files:**
- Modify: `lib/db/schema/draft.ts`, `lib/generation/contract.ts` (필요 시 `GenerationJobKind`)
- Create: `drizzle/0019_*.sql`, `drizzle/meta/*`

**Interfaces:**
- Produces:
  - `draftPrompt.kind` text not null default `'draft'`, check `draft_prompt_kind_check` (`'draft'`, `'fill'`)
  - `draftPrompt.blankId` text null, `blankQuestion` text null, `blankAnswer` text null, `blankContext` text null (요청 시점 본문 Markdown, 대상 빈칸 자리 `{{target}}`)
  - `draftPrompt.analysis` jsonb null (초안 작성 분석 결과)
  - `export const GENERATION_JOB_KINDS = ['draft', 'fill'] as const; export type GenerationJobKind`
- 스펙 4.1 표에 없는 `blank_context` 는 Lambda 가 Tiptap 없이 본문을 읽기 위해 더한다.

- [ ] Step 1: 스키마 작성, `pnpm db:generate` 로 0019 생성 (ALTER ADD COLUMN 과 check 만인지 확인)
- [ ] Step 2: 검증 명령 통과
- [ ] Step 3: 커밋 `feat: 작업 종류와 빈칸 채우기 컬럼`
- [ ] Step 4 (컨트롤러): 0019 로컬·운영 적용

---

### Task 2: 빈칸 id 와 문서 순수 함수 (comdraft)

**Files:**
- Modify: `lib/studio/draft-blank-node.ts` (id 속성, Markdown `allowedAttributes` 에 `id`), `lib/studio/draft-blank.ts`, `lib/generation/markdown.ts` (변환 결과에 id 부여)
- Test: `lib/studio/draft-blank.test.ts`, `lib/generation/markdown.test.ts`

**Interfaces:**
- Produces (모두 `lib/studio/draft-blank.ts`, 순수):
  - `ensureBlankIds(doc: JSONContent, createId?: () => string): JSONContent` (id 없거나 UUID 가 아닌 빈칸에만 새 id, 중복 id 는 뒤엣것에 새 id)
  - `findBlank(doc, blankId): { kind; hint; text: string } | null` (`text` 는 빈칸 안 글)
  - `replaceBlank(doc, blankId, paragraphs: JSONContent[]): { doc: JSONContent; replaced: boolean }`
  - `hasDraftBody(doc: JSONContent | null): boolean` (제목 하나와 빈 문단만이면 false — 다시 작성 경고 판단)

- [ ] Step 1: 실패하는 테스트
  - `ensureBlankIds`: id 없는 빈칸 둘 → 서로 다른 UUID, 기존 UUID 유지, 같은 id 두 개 → 두 번째만 새 id, 입력 불변
  - `replaceBlank`: 대상 빈칸 자리에 문단 2개가 들어가고 다른 노드 그대로, 없는 id → `replaced: false` 와 원본, 목록 안 빈칸도 찾음
  - `findBlank`: hint·kind·안 글 반환
  - `hasDraftBody`: null·빈 문서·제목만 → false, 문단 글이 있으면 true, 빈칸만 있어도 true
  - `markdownToDraftDocument`: `:::blank` 결과 빈칸마다 id 가 붙음
- [ ] Step 2: 실패 확인 → Step 3: 구현 → Step 4: 검증 명령 통과
- [ ] Step 5: 커밋 `feat: 빈칸 id 와 빈칸 찾기·바꾸기 함수`

---

### Task 3: 빈칸 채우기 서버 흐름 (comdraft)

**Files:**
- Modify: `lib/generation/jobs.ts` (잠금 판정, 이어 볼 작업, 결과 반영, 생성), `lib/generation/job-state.ts`, `lib/actions/generation.ts` (`requestBlankFill`, 상태 조회에 kind·blankId), `lib/studio/queries.ts` (기본 옵션은 kind='draft' 기준, 열 때 빈칸 id 부여·채우기 결과 반영), `lib/generation/fake-runner.ts`, `lib/generation/limits.ts`
- Create: 필요 시 `lib/generation/blank-fill.ts` (순수: 요청 검증, 본문 → Markdown + `{{target}}`)
- Test: 해당 순수 함수 테스트

**Interfaces:**
- Consumes: Task 1 컬럼, Task 2 함수
- Produces:
  - `GenerationJobView` 에 `kind: GenerationJobKind`, `blankId: string | null`
  - `requestBlankFill(input: { repositoryId: string; draftId: string; blankId: string; answer: string }): Promise<{ status: 'started'; job: GenerationJobView } | { status: 'busy' | 'rate_limited' | 'invalid' | 'not_found' | 'github_reauth' | 'runner_unavailable' | 'quota_unavailable' } | { status: 'quota_exhausted'; resetsAt: string } | { status: 'blank_missing' }>`
  - `markFillApplied(jobId)` 서버 액션 (편집기가 반영한 뒤 호출; 소유 확인)
  - `MAX_BLANK_ANSWER_LENGTH = 1000`
- 규칙:
  - `lockingJobExists` 와 `isJobLocking` 은 `kind='draft'` 만 잠금으로 본다. 유일 인덱스(진행 작업 하나)는 그대로.
  - `requestBlankFill`: 초안 작성과 같은 검사(세션, 소유, 시간당 제한, 사용자 단위 시간 초과 정리, 주간 할당량, GitHub 토큰 — Lambda 가 GitHub 를 부르지 않으면 토큰 검사는 건너뜀) → 본문에 빈칸 있는지 → 본문 Markdown 스냅숏(대상 빈칸 자리 `{{target}}`, 다른 빈칸은 `[빈칸: 질문]`)을 `blankContext` 에 → 옵션은 최근 `kind='draft'` 작업에서 복사 → 작업 생성 → 실행기 시작.
  - 본문 Markdown 변환은 서버에서 Tiptap Markdown 직렬화(문서 스키마 확장 그대로)를 쓴다. 가능한 API 는 `node_modules/@tiptap/markdown` 에서 확인.
  - 상태 조회와 초안 열기(`syncDraftJobs` 계열): 완료·미반영 `fill` 작업은 서버가 `replaceBlank` 로 본문에 반영하고 `appliedAt` 을 남긴다 (화면이 열려 있지 않은 경우). 화면이 열려 있으면 화면이 먼저 반영하고 `markFillApplied` 를 부른다. 두 경로가 겹쳐도 한 번만 반영되도록 `appliedAt is null` 조건부 UPDATE 로 선점한다. 빈칸이 없으면 결과를 버리고 `appliedAt` 만 남긴다.
  - 이어 볼 작업(`resumableJob`)과 화면 기본 옵션: 기본 옵션은 최근 `kind='draft'` 작업, 이어 볼 작업은 종류와 무관하게 최근 작업.
  - 가짜 실행기: `fill` 이면 답을 그대로 한 문단 Markdown 으로 `result` 에 두고 고정 사용량(3,000)을 기록.

- [ ] Step 1: 순수 함수 실패 테스트 (요청 검증: 답 공백·1,000자 초과·UUID 아닌 id 거부; 본문 → Markdown 스냅숏에 `{{target}}` 한 번, 다른 빈칸 표시)
- [ ] Step 2: 실패 확인 → Step 3: 구현 → Step 4: 검증 명령 통과
- [ ] Step 5: 커밋 `feat: 빈칸 채우기 요청과 결과 반영 서버 흐름`

---

### Task 4: 빈칸 버튼, 다듬는 중 표시, 다시 작성 경고 (comdraft 화면)

**Files:**
- Modify: `components/studio/draft-blank-node-view.ts` (버튼 3개, 잠금 표시), `components/studio/editor-extensions.ts`, `components/studio/draft-editor.tsx` (열 때 `ensureBlankIds`, 다듬기 전 자동 저장 마무리, 결과 반영), `hooks/use-generation-job.ts` (또는 빈칸 채우기 전용 훅), `components/studio/studio-workspace.tsx`, `components/studio/prompt-composer.tsx` (다시 작성 확인 창), `locales/*`

**Interfaces:**
- Consumes: Task 2 함수, Task 3 액션과 `GenerationJobView.kind/blankId`
- 동작 (스펙 3장, 4.4~4.6, 5장):
  - 다듬기: 답이 비면 비활성, 1,000자 초과면 비활성+안내, AI 작성 중이거나 다른 빈칸 다듬는 중이면 비활성. 누르면 자동 저장을 마친 뒤 `requestBlankFill`.
  - 그대로 넣기: 기존 `liftDraftBlank`. 지우기: 노드 삭제 (실행 취소 가능).
  - 다듬는 중: 그 빈칸만 `contenteditable=false` 와 "AI 가 다듬는 중이에요", 버튼 숨김. 나머지 편집 가능. 상태는 클라이언트 상태(진행 중 작업의 blankId).
  - 완료: 편집기에서 `replaceBlank` 와 같은 결과를 트랜잭션으로 적용(그 빈칸만), `markFillApplied`, 자동 저장. 결과 Markdown → 문단은 Task 2/3 의 변환 사용.
  - 실패: 잠금 해제, 답 유지, 안내.
  - 새로고침 후: `resumableJob` 이 진행 중 `fill` 이면 그 빈칸 잠금 복원, 최근 실패면 안내 한 번.
  - 다시 작성 확인: `hasDraftBody(본문)` 이 true 면 기존 `ConfirmDialog` 로 확인 후 요청.
- 문구는 Global Constraints. i18n extract → en 번역 → compile.

- [ ] Step 1: 새 순수 로직이 생기면 테스트 (예: 다듬기 버튼 활성 판단)
- [ ] Step 2: 구현
- [ ] Step 3: 검증 명령과 `pnpm build` 통과
- [ ] Step 4: 커밋 `feat: 빈칸 다듬기·그대로 넣기·지우기와 다시 작성 확인`
- [ ] Step 5 (컨트롤러): 로컬 브라우저 확인 (가짜 실행기)

---

### Task 5: 블로그 글 프롬프트 개선 (comdraft-lambda)

**Files:**
- Modify: `src/prompts/ko.ts`, `src/prompts/en.ts`, `src/prompts/types.ts`, `src/prompts/render.ts`, `src/generation/assemble.ts` (커밋 자리표시자·커밋 참고 제거), `src/generation/schemas.ts` 또는 `src/pipeline.ts` (빈칸 상한 강제), 관련 테스트 (`src/prompts/prompts.test.ts`, `src/generation/assemble.test.ts`, `src/pipeline.test.ts`)

**Interfaces:**
- Produces:
  - `BLANK_LIMIT: Record<'short' | 'medium' | 'long', number> = { short: 1, medium: 2, long: 3 }`
  - 분석 결과의 `unknowns` 를 상한까지만 남기는 처리(앞에서부터), 남지 않은 빈칸을 가리키던 절은 사실만으로 쓰게 함
- 프롬프트 변경 (스펙 6장):
  - 공통 목소리 규칙 (1인칭 글쓴이, 다른 개발자에게 소개하는 블로그 글, 답변체·보고서체 금지)
  - `{{commit:…}}` 자리표시자와 관련 규칙 삭제, 조립 단계에서 커밋 처리 삭제 (참고 링크만)
  - 글 유형을 흐름으로 재정의, 기획의 절 제목·연결 규칙, 작성의 도입·연결·마무리 규칙
  - 빈칸 규칙: 입력만으로 알 수 없고 없으면 글이 성립하지 않는 내용에만, 상한 수, 한두 문장으로 답할 수 있는 질문, 틀의 단계라도 근거 없으면 절을 만들지 않음
- 테스트: 프롬프트에 `{{commit:` 없음, 목소리·흐름·상한 문구 포함(ko/en), 조립 결과에 커밋 링크 없음, 빈칸 상한 강제(4개 → medium 이면 2개)

- [ ] Step 1: 실패 테스트 → Step 2: 구현 → Step 3: 검증 명령 통과
- [ ] Step 4: 커밋 `feat: 블로그 글 목소리와 흐름, 빈칸 상한으로 프롬프트 개선`

---

### Task 6: 분석 결과 저장과 빈칸 채우기 작업 (comdraft-lambda)

**Files:**
- Modify: `src/jobs.ts` (`loadContext` 에 kind·빈칸 값, `saveAnalysis`, 최근 분석 읽기), `src/run-job.ts` (kind 분기), `src/pipeline.ts` (분석 뒤 저장), `src/contract.ts` (필요 시), `src/generation/estimate.ts`, `src/generation/limits.ts`
- Create: `src/fill.ts` 또는 `src/generation/fill.ts` (빈칸 채우기 실행), 프롬프트 `fill` 섹션 (ko/en, `src/prompts/*`)
- Test: `src/run-job.test.ts`, 새 fill 테스트, `src/prompts/prompts.test.ts`

**Interfaces:**
- Consumes: Task 1 컬럼 (DB), Task 5 프롬프트 구조
- Produces:
  - `JobContext.kind`, `JobContext.blank?: { id; question; answer; context: string }`
  - `JobStore.saveAnalysis(jobId, analysis)`, `JobStore.loadLatestAnalysis(jobId): Promise<StoredAnalysis | null>` (같은 초안의 최근 완료 `kind='draft'` 작업)
  - 저장 형태 `StoredAnalysis`: 절별 사실 문장, 코드 point(코드 원문 제외), 빈칸 질문. 커밋 본문·코드 원문은 넣지 않음
  - `ESTIMATE_FILL_OUTPUT = 1_500`
- 빈칸 채우기 실행: 예상량(시스템 + 본문 + 분석 + 답 + 1,500) → `reserveQuota` → Claude 한 번(`write` 류 호출, `onUsage` 기록) → 결과 정리(조립 단계의 안전 처리 재사용: 링크·HTML 무력화, 제목·코드 블록·표·이미지 제거, 문단 1~3개로 자르기) → `complete`.
- 프롬프트: 입력 `<context>`(본문, `{{target}}`), `<analysis>`, `<question>`, `<answer>`(데이터 규칙 적용), 출력 규칙(스펙 6.5).
- 테스트: fill 작업은 Claude 한 번·사용량 기록, 분석 없을 때 동작, 할당량 거부 시 Claude 0회, 결과 정리(제목·링크 제거), 초안 작성 작업이 분석을 저장

- [ ] Step 1: 실패 테스트 → Step 2: 구현 → Step 3: 검증 명령 통과
- [ ] Step 4: 커밋 `feat: 분석 결과 저장과 빈칸 채우기 작업`

---

### Task 7: 마무리 (컨트롤러)

- [ ] 두 저장소 전체 검증과 `pnpm build`
- [ ] 로컬 브라우저: 다듬기(가짜 실행기)·그대로 넣기·지우기, 다듬는 중 잠금과 다른 곳 편집, 새로고침 후 잠금 복원, 실패 안내, 다시 작성 확인 창
- [ ] 최종 리뷰, 사용자 확인 후 병합·push, Lambda 배포 (실행 직전 확인)
