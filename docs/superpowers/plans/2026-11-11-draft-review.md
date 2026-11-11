# 독자 기준 초안 작성과 검토·고쳐 쓰기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 초안이 저장소를 모르는 독자 기준으로 쓰이고, 요청·빈칸 답·참고 링크를 맥락에 맞게 엮고, 작성 뒤 검토와 필요할 때만 고쳐 쓰기를 거치게 한다.

**Architecture:** comdraft-lambda 의 기획 스키마에 링크 역할(`linkRoles`)을 더해 분석·작성·검토 입력에 싣는다. 여섯 단계 system 에 독자 규칙을 넣고 요청·답·링크 규칙을 고친다. 파이프라인은 작성(자리표시자 초안) 뒤 새 `review` 단계에서 검토 → (문제 있으면) 고쳐 쓰기 → 조립을 하고, 검토·고쳐 쓰기의 실패·시간 부족은 원래 초안으로 넘어간다. comdraft 는 진행 3단계 이름만 바꾼다.

**Tech Stack:** TypeScript (Node 22 strip-types), node:test, zod, @anthropic-ai/sdk 구조화 출력 / Next.js 16, Lingui

**Spec:** `docs/superpowers/specs/2026-11-11-draft-review-and-reader-context-design.md`

## Global Constraints

- 작업 저장소와 브랜치: Task 1~5 는 `/Users/junmyeongjo/Workspace/comdraft-lambda` 의 `feat/draft-review` 브랜치, Task 6 은 `/Users/junmyeongjo/Workspace/comdraft` 의 `feat/draft-review` 브랜치. worktree 를 만들지 않는다.
- 셸 명령 앞에 `export PATH=/Users/junmyeongjo/.nvm/versions/node/v24.12.0/bin:$PATH;` 를 붙인다 (pnpm 11).
- Lambda 테스트: `pnpm test`, 타입: `pnpm typecheck`. comdraft: `pnpm test`, `pnpm typecheck`, `pnpm lint`.
- ko.ts 와 en.ts 는 같은 구조(같은 키, 같은 절)를 유지한다. 한쪽을 바꾸면 다른 쪽도 같은 뜻으로 바꾼다.
- 규칙 문장은 금지만 나열하지 않고 왜 그런지 짧게 덧붙인다 (기존 프롬프트 방식).
- 주석과 테스트 이름은 한국어, 기존 파일의 말투를 따른다. 디버그용 `console` 을 남기지 않는다.
- 비밀값·요청·코드 내용을 오류 메시지나 로그에 넣지 않는다 (사유 코드만).
- db:migrate, terraform apply, push 는 하지 않는다.
- 값 (스펙 그대로):
  - `LINK_PREVIEW_CHARS = 1_500`
  - 링크 역할: `docs` | `article` | `discussion` | `other`, `relation` 최대 120자
  - 검토: effort `low`, maxTokens `4_000`, issues 최대 8개, `quote` 200자 이내(안내), `fix` 최대 150자
  - 검토 kind: `unknown_term` | `request_echo` | `link_context` | `unsupported` | `voice` | `flow`
  - 고쳐 쓰기: effort `medium`, maxTokens `16_000`
  - `REVIEW_MIN_REMAINING_MS = 60_000`, `REVISE_MIN_REMAINING_MS = 90_000`
  - `ESTIMATE_OUTLINE_CODE = 4_000`, `ESTIMATE_REVIEW_OUTPUT = 2_000`
  - comdraft 3단계 이름: `작성·검토` / en `Write & review`

## Review Focus

1. 모델이 초안 전체를 바깥 코드 펜스로 감싸 보낸 경우: 검토의 `quote` 대조와 자리표시자 비교는 펜스를 푼 초안 기준이어야 한다 → Task 3 `acceptRevision` 테스트, Task 5 파이프라인 테스트.
2. `quote` 에 인라인 코드·굵게 같은 Markdown 표시가 섞이거나 줄바꿈 위치가 다른 경우: 공백 차이만 같은 것으로 보고, 글자가 같으면 찾아야 한다 → Task 3 `validateReview` 테스트.
3. 검토 호출 자체가 `GenerationFailure('timeout')` 을 던지는 경우: 작업이 실패하지 않고 원래 초안이 저장되어야 한다 → Task 5 파이프라인 테스트.
4. 참고 링크가 하나도 없거나 모델이 `linkRoles` 를 비워 보낸 경우: 렌더링에 빈 속성이 생기지 않고 링크는 `other` 로 채워져야 한다 → Task 1 테스트.
5. en 로케일 작업: 검토·고쳐 쓰기 프롬프트가 en 에도 있고 같은 표식을 가져야 한다 → Task 4 테스트.

---

### Task 1: 기획의 링크 역할과 렌더링

**Files:**
- Modify: `src/generation/schemas.ts`, `src/generation/validate.ts`, `src/generation/limits.ts`, `src/prompts/render.ts`, `src/prompts/ko.ts`, `src/prompts/en.ts` (user 입력 렌더 호출부만), `src/pipeline.ts` (validatePlan 호출 타입만 필요 시)
- Test: `src/generation/validate.test.ts`, `src/prompts/prompts.test.ts`, `src/pipeline.test.ts` (PLAN 상수에 `linkRoles` 추가)

**Interfaces:**
- Produces:
  - `schemas.ts`: `export const LINK_ROLES = ['docs', 'article', 'discussion', 'other'] as const; export type LinkRole`. `PlanSchema` 에 `linkRoles: z.array(z.object({ id: z.string(), role: z.string(), relation: z.string() }))` (role 은 mode 처럼 문자열로 받고 검증에서 보정). `export type RawPlan = z.infer<typeof PlanSchema>`. `export interface LinkRoleEntry { id: string; role: LinkRole; relation: string }`. `export type Plan = Omit<RawPlan, 'linkRoles'> & { linkRoles: LinkRoleEntry[] }`.
  - `export const LINK_RELATION_MAX = 120` (schemas.ts 또는 limits.ts)
  - `validatePlan(plan: RawPlan, ctx: { hunkIds: Set<string>; linkIds: Set<string>; length: string }): Plan`
  - `render.ts`: `renderLinks(links: PreparedLink[], options: { preview: boolean; roles?: LinkRoleEntry[] }): string` — roles 가 있으면 `<link id role relation>` 속성으로 붙인다(빈 relation 은 기존 `attrs` 가 생략). `renderLinkTitles(links: PreparedLink[], roles: LinkRoleEntry[]): string` — `<link id role relation>제목</link>`.
- Consumes: 없음

- [ ] **Step 1: 브랜치 만들기** — comdraft-lambda 에서 `git switch -c feat/draft-review`.

- [ ] **Step 2: 실패하는 테스트 작성** (`validate.test.ts`)

```ts
it('linkRoles 는 모르는·중복 번호를 버리고 빠진 링크를 other 로 채워 입력 링크 순서로 둔다', () => {
  const raw = { ...RAW_PLAN, linkRoles: [
    { id: 'L2', role: 'docs', relation: '설정 절차를 따른다' },
    { id: 'L9', role: 'docs', relation: '없는 링크' },
    { id: 'L2', role: 'article', relation: '중복' },
    { id: 'L1', role: 'weird', relation: 'x'.repeat(200) },
  ] };
  const plan = validatePlan(raw, { hunkIds: new Set(), linkIds: new Set(['L1', 'L2', 'L3']), length: 'medium' });
  assert.deepEqual(plan.linkRoles, [
    { id: 'L1', role: 'other', relation: 'x'.repeat(120) },
    { id: 'L2', role: 'docs', relation: '설정 절차를 따른다' },
    { id: 'L3', role: 'other', relation: '' },
  ]);
});
it('링크가 없으면 linkRoles 는 빈 목록이다', () => { /* linkIds 빈 Set, raw.linkRoles 에 L1 → [] */ });
```

(`RAW_PLAN` 은 그 파일의 기존 기획 픽스처에 `linkRoles: []` 를 더한 것. relation 은 앞뒤 공백을 뺀 뒤 자른다.)

`prompts.test.ts`:

```ts
it('기획 입력의 링크 미리보기는 1,500자까지 보인다', () => { /* text 2,000자 링크 → plan.user 에 1,500자 + '…', 1,501번째 글자 없음 */ });
it('분석·작성 입력의 링크에 역할과 관계가 붙고, 관계가 비면 속성을 생략한다', () => {
  // analyze.user 에 '<link id="L1" role="docs" relation="설정 절차를 따른다">' 포함
  // write.user 에 '<link id="L1" role="docs" relation="설정 절차를 따른다">' 포함
  // relation '' 인 L2 는 '<link id="L2" role="other">'
});
```

- [ ] **Step 3: 실행해 실패 확인** — `pnpm test` → 위 테스트가 linkRoles/role 속성 없음으로 FAIL.

- [ ] **Step 4: 구현** — 위 Interfaces 대로. `LINK_PREVIEW_CHARS` 를 `1_500` 으로. `validatePlan` 은 linkIds 순회 순서(입력 링크 순)로 결과를 만든다. 모르는 role 은 `other`. ko/en 의 analyze.user 는 `renderLinks(links, { preview: false, roles: plan.linkRoles })`, write.user 는 `renderLinkTitles(links, plan.linkRoles)`. `AnalyzePromptInput`·`WritePromptInput` 은 이미 plan 을 받으므로 타입 변경 없음. 기존 테스트의 `Plan` 픽스처에 `linkRoles: []` 를 더한다.

- [ ] **Step 5: 통과 확인** — `pnpm test && pnpm typecheck` → PASS.

- [ ] **Step 6: 커밋** — `git commit -m "feat: 기획 단계 참고 링크 역할과 관계"`

---

### Task 2: 독자 기준·요청·링크·빈칸 답 프롬프트 규칙

**Files:**
- Modify: `src/prompts/ko.ts`, `src/prompts/en.ts`, `src/prompts/types.ts`
- Test: `src/prompts/prompts.test.ts`

**Interfaces:**
- Consumes: Task 1 의 `linkRoles` 필드 이름과 `LINK_ROLES` 값
- Produces: `PromptPack.readerRuleMarker: string` (READER_RULE 의 고정 구절, 테스트용). ko 는 `'독자는 이 저장소와 코드, 요청 문구를 본 적이 없다'`, en 은 같은 뜻의 고정 구절.

- [ ] **Step 1: 실패하는 테스트 작성** (ko, en 모두 도는 기존 패턴으로)

```ts
it('기획·분석·작성·빈칸 채우기 system 은 독자 규칙을 담는다', () => {
  for (const pack of [ko, en]) for (const stage of [pack.plan, pack.analyze, pack.write, pack.fill])
    assert.ok(stage.system.includes(pack.readerRuleMarker));
});
it('기획 system 은 linkRoles 출력과 네 가지 역할을 설명한다', () => {
  // plan.system 에 'linkRoles', 'docs', 'article', 'discussion', 'other', 'relation' 포함
});
it('분석 system 은 hunk 와 링크를 함께 근거로 문서를 따른 사실을 적으라고 한다', () => {
  // analyze.system 에 'role' 과 docs 언급, 예시 문장(ko: '공식 문서', en: 'official documentation') 포함
});
it('빈칸 채우기 system 은 답 전체가 아니라 맞는 부분만 고르게 한다', () => {
  // ko.fill.system 이 '답을 사실로 삼아' 를 포함하지 않고, '맞는 부분만' 을 포함 (en 은 'only the parts' 같은 고정 구절)
});
```

- [ ] **Step 2: 실행해 실패 확인** — `pnpm test` → FAIL (`readerRuleMarker` 없음 등).

- [ ] **Step 3: 프롬프트 수정** — 스펙 3절, 4절, 5절의 규칙을 문장으로 옮긴다:
  - `READER_RULE` (스펙 3절 네 항목) 을 `VOICE_RULE` 옆에 정의하고 plan/analyze/write/fill system 에 넣는다.
  - 분석 근거 규칙: 사실 문장·point 를 독자 기준으로 쓰기, "이름은 입력 그대로" 규칙은 이름을 쓸 때 철자 유지로 문구 조정 (스펙 3절 단계별 적용).
  - 작성 근거 범위: 내부 이름을 역할로 풀어 쓰는 것은 새 사실이 아님 (사실·코드에서 보이는 역할만).
  - `DATA_RULE` 의 `<request>` 항목과 기획 규칙, 분석의 R 규칙: 스펙 4.1 (안내 vs 글감, R 사실의 두 조건, 지시·형식 요구 제외, 표현 베끼지 않기).
  - 기획 출력 필드에 `linkRoles` (id, role 네 값과 뜻, relation 한 문장·120자·확인되는 것만·없으면 빈 문자열) 와 기획 규칙 한 줄.
  - 분석 입력 형식의 `<link>` 에 role·relation 속성 설명, 근거 규칙에 스펙 5.2 세 항목.
  - 작성 입력 형식의 `<links>` 항목 속성 설명, 자리표시자 `{{link:…}}` 규칙 옆에 스펙 5.3 세 항목.
  - 빈칸 채우기 규칙: 스펙 4.2 ("답을 사실로 삼아" 문장을 바꿈).
  - `types.ts` 의 `PromptPack` 에 `readerRuleMarker` 추가 (주석: 테스트용 고정 구절).

- [ ] **Step 4: 통과 확인** — `pnpm test && pnpm typecheck` → PASS (기존 프롬프트 테스트 포함).

- [ ] **Step 5: 커밋** — `git commit -m "feat: 독자 기준과 요청·링크·빈칸 답 역할 프롬프트 규칙"`

---

### Task 3: 검토 결과 검증과 고쳐 쓴 초안 확인 (순수 함수)

**Files:**
- Create: `src/generation/review.ts`
- Modify: `src/generation/assemble.ts` (`unwrapOuterFence` export 만), `src/generation/limits.ts`
- Test: `src/generation/review.test.ts`

**Interfaces:**
- Produces (`review.ts`):
  - `export const REVIEW_KINDS = ['unknown_term', 'request_echo', 'link_context', 'unsupported', 'voice', 'flow'] as const; export type ReviewKind`
  - `export const ReviewSchema = z.object({ issues: z.array(z.object({ kind: z.string(), quote: z.string(), fix: z.string() })) })`, `export type RawReview`
  - `export interface ReviewIssue { kind: ReviewKind; quote: string; fix: string }`
  - `export const validateReview = (raw: RawReview, draft: string): ReviewIssue[]`
  - `export const acceptRevision = (draft: string, revised: string, linkIds: Set<string>): string | null` — 받아들이면 바깥 펜스를 푼 고친 초안, 아니면 null
- `limits.ts`: `MAX_REVIEW_ISSUES = 8`, `REVIEW_FIX_MAX = 150`, `REVIEW_MIN_REMAINING_MS = 60_000`, `REVISE_MIN_REMAINING_MS = 90_000`
- `assemble.ts`: `export const unwrapOuterFence` (동작 변경 없음)

결정 (스펙에 없는 부분): 목록 밖 `kind` 항목은 버린다. `fix` 는 앞뒤 공백을 빼고 150자로 자른다. `quote` 는 자르지 않는다(대조용). `quote` 나 `fix` 가 비면 버린다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
const DRAFT = '# 제목\n\n## 설정\n\n`createSafeLookup` 을 추가했다.\n공식   문서대로\n설정했다.\n\n{{code:S1}}\n\n{{ask:U1}}';

describe('validateReview', () => {
  it('초안에 있는 quote 만 남기고 공백 차이는 같은 것으로 본다', () => {
    const issues = validateReview({ issues: [
      { kind: 'unknown_term', quote: '`createSafeLookup` 을 추가했다.', fix: '역할로 풀어 쓴다' },
      { kind: 'link_context', quote: '공식 문서대로 설정했다.', fix: '문서 링크를 넣는다' },
      { kind: 'voice', quote: '초안에 없는 문장', fix: 'x' },
    ] }, DRAFT);
    assert.deepEqual(issues.map((i) => i.kind), ['unknown_term', 'link_context']);
  });
  it('모르는 kind, 중복 quote, 자리표시자만 있는 quote, 빈 fix 를 버리고 8개로 자른다', () => { /* … */ });
  it('fix 는 150자로 자른다', () => { /* 200자 fix → 150자 */ });
});

describe('acceptRevision', () => {
  const links = new Set(['L1']);
  it('자리표시자를 지키고 링크를 더한 초안을 받아들인다', () => {
    const revised = DRAFT.replace('공식   문서대로', '공식 문서 {{link:L1}} 대로');
    assert.equal(acceptRevision(DRAFT, revised, links), revised);
  });
  it('바깥 코드 펜스를 풀고 받아들인다', () => {
    assert.equal(acceptRevision(DRAFT, '```markdown\n' + DRAFT + '\n```', links), DRAFT);
  });
  it('제목이 없거나, code·ask 를 빠뜨리거나 늘리거나 새로 만들거나, 모르는 링크를 쓰거나, 비면 거절한다', () => {
    for (const revised of [
      DRAFT.replace('# 제목\n\n', ''),
      DRAFT.replace('{{code:S1}}', ''),
      `${DRAFT}\n\n{{code:S1}}`,
      DRAFT.replace('{{ask:U1}}', '{{ask:U2}}'),
      `${DRAFT} {{link:L9}}`,
      '   ',
    ]) assert.equal(acceptRevision(DRAFT, revised, links), null);
  });
});
```

- [ ] **Step 2: 실행해 실패 확인** — `pnpm test` → review.ts 없음으로 FAIL.

- [ ] **Step 3: 구현** — 공백 정규화는 `/\s+/g` → `' '` 후 trim. 자리표시자 인식은 assemble 의 `PLACEHOLDER` 와 같은 모양(`{{ code : S1 }}` 처럼 안쪽 공백 허용)으로 code·ask·link 를 센다. 제목 검사는 펜스를 푼 결과의 `trimStart()` 가 `# ` 로 시작하는지.

- [ ] **Step 4: 통과 확인** — `pnpm test && pnpm typecheck` → PASS.

- [ ] **Step 5: 커밋** — `git commit -m "feat: 초안 검토 결과 검증과 고쳐 쓴 초안 확인"`

---

### Task 4: 검토·고쳐 쓰기 프롬프트

**Files:**
- Modify: `src/prompts/types.ts`, `src/prompts/render.ts`, `src/prompts/ko.ts`, `src/prompts/en.ts`
- Test: `src/prompts/prompts.test.ts`

**Interfaces:**
- Consumes: Task 1 `LinkRoleEntry`·`renderLinkTitles`, Task 3 `ReviewIssue`, `REVIEW_KINDS`
- Produces:
  - `types.ts`: `ReviewPromptInput { context: JobContext; plan: Plan; analysis: Analysis; hunks: Map<string, PreparedHunk>; links: PreparedLink[]; draft: string }`, `RevisePromptInput extends ReviewPromptInput { issues: ReviewIssue[] }`. `PromptPack` 에 `review: Stage<ReviewPromptInput>`, `revise: Stage<RevisePromptInput>`.
  - `render.ts`: TAGS 에 `'draft', 'issues', 'issue', 'quote', 'fix'` 추가. `renderDraft(markdown: string): string` → `<draft>` 로 감싸고 탈출. `renderIssues(issues: ReviewIssue[]): string` → `<issues>` 안에 `<issue kind="…">` + `<quote>`, `<fix>`.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('검토·고쳐 쓰기 system 은 데이터·목소리·독자 규칙을 담는다', () => {
  for (const pack of [ko, en]) for (const stage of [pack.review, pack.revise]) {
    assert.ok(stage.system.includes(pack.dataRuleMarker));
    assert.ok(stage.system.includes(pack.voiceRuleMarker));
    assert.ok(stage.system.includes(pack.readerRuleMarker));
  }
});
it('검토 system 은 여섯 가지 kind 와 quote·fix 를 설명한다', () => { /* REVIEW_KINDS 모두, 'quote', 'fix' 포함 */ });
it('고쳐 쓰기 system 은 작성의 자리표시자 문법을 그대로 담는다', () => { /* '{{code:S1}}', '{{link:L1}}', '{{ask:U1}}' 포함 */ });
it('검토 입력에 요청, 글 재료, 역할 붙은 링크, 초안이 태그 안에 들어간다', () => {
  // review.user 에 '<request>', '<outline>', '<link id="L1" role=', '<draft>' 포함
});
it('고쳐 쓰기 입력에 문제 목록이 들어가고 초안·quote 는 태그를 위조하지 못한다', () => {
  // draft 에 '</draft>' 가 있으면 '&lt;/draft>' 로, quote 의 '</quote>' 도 탈출
  // revise.user 에 '<issue kind="unknown_term">' 포함
});
```

- [ ] **Step 2: 실행해 실패 확인** — `pnpm test` → FAIL.

- [ ] **Step 3: 구현** — 프롬프트 문장은 스펙 6.2(검토 입력·출력·kind 뜻·검토 규칙)와 6.3(고쳐 쓰기 규칙)을 옮긴다.
  - REVIEW_SYSTEM: 역할 설명(작성된 초안을 독자 기준으로 점검, 고칠 곳만 적는다) + DATA_RULE + VOICE_RULE + READER_RULE + 입력 형식 + kind 표 + 출력 필드(quote 는 초안 글자 그대로 200자 이내, fix 한 문장 150자 이내, 최대 8개 중요한 것부터) + 검토 규칙.
  - REVISE_SYSTEM: 역할 설명 + DATA_RULE + VOICE_RULE + READER_RULE + 입력 형식 + 고쳐 쓰기 규칙 + 작성 system 의 근거 범위·자리표시자·Markdown·분량과 문체 절을 공유 상수로 빼서 그대로 넣는다 (복사하지 말고 WRITE_SYSTEM 과 같은 상수를 쓴다) + OPTION_TABLE.
  - review.user: 옵션 줄, `## 요청` tagRequest, `## 글 재료` renderOutline, `## 참고 링크` renderLinkTitles(없으면 NONE), `## 초안` renderDraft, 마지막 지시 한 줄.
  - revise.user: review.user 의 내용 + `## 고칠 점` renderIssues, 마지막 지시 한 줄 (첫 줄은 `# 제목`).

- [ ] **Step 4: 통과 확인** — `pnpm test && pnpm typecheck` → PASS.

- [ ] **Step 5: 커밋** — `git commit -m "feat: 초안 검토와 고쳐 쓰기 프롬프트"`

---

### Task 5: 파이프라인 검토 단계, 예상량, 작업 실행 연결

**Files:**
- Modify: `src/pipeline.ts`, `src/placeholder-pipeline.ts`, `src/run-job.ts`, `src/handler.ts`, `src/generation/estimate.ts`, `src/generation/limits.ts`
- Test: `src/pipeline.test.ts`, `src/run-job.test.ts`, `src/generation/estimate.test.ts`

**Interfaces:**
- Consumes: Task 3 `validateReview`, `acceptRevision`, `ReviewSchema`, `unwrapOuterFence`, 시간 상수 / Task 4 `pack.review`, `pack.revise`
- Produces:
  - `pipeline.ts`: `Pipeline<P, C, A, W>` 에 `write: (input, analyzed: A) => Promise<W>`, `review: (input, written: W) => Promise<string>`. `export interface Written extends Analyzed { draft: string; selected: Map<string, PreparedHunk> }`. `createClaudePipeline(deps): Pipeline<Prepared, Classified, Analyzed, Written>`.
  - `ClaudePipelineDependencies` 에 `remainingTimeMs: () => number`, `reportError?: (error: unknown) => void`.
  - `REVIEW_STAGE = { effort: 'low', maxTokens: 4_000 } as const`. 고쳐 쓰기는 `WORK_STAGE`.
  - `estimate.ts`: `SystemTokens` 에 `review: number; revise: number`. `limits.ts`: `ESTIMATE_OUTLINE_CODE = 4_000`, `ESTIMATE_REVIEW_OUTPUT = 2_000`.

`review` 의 동작:

```
draft = unwrapOuterFence(written.draft)
final = draft
try:
  if remainingTimeMs() >= REVIEW_MIN_REMAINING_MS:
    raw = llm.parse(review, ReviewSchema, REVIEW_STAGE)
    issues = validateReview(raw, draft)
    if issues.length > 0 and remainingTimeMs() >= REVISE_MIN_REMAINING_MS:
      revised = llm.write(revise, WORK_STAGE)
      accepted = acceptRevision(draft, revised, linkIds)
      if accepted: final = accepted
      else: reportError(new GenerationFailure('invalid_result'))
catch error: reportError(error)
return assemble({ markdown: final, analysis, commits, hunks: selected, links, request, referencesHeading })
```

- [ ] **Step 1: 실패하는 테스트 작성**

`pipeline.test.ts` — `fakeLlm` 을 parse 응답 목록(기획, 분석, 검토 순)과 write 응답 목록(작성, 고쳐 쓰기 순)을 받는 형태로 넓히고, `run()` 이 `write` 뒤 `review` 를 부르며 `remainingTimeMs`(기본 300_000)·`reportError` 를 넘기게 한다.

```ts
it('검토에 문제가 없으면 고쳐 쓰지 않고 원래 초안을 조립한다', async () => { /* parse 3회, write 1회, 결과에 원래 문장 */ });
it('검토에 문제가 있으면 고쳐 쓴 초안을 조립한다', async () => { /* write 2회, 결과에 고친 문장, 고쳐 쓰기 user 에 '<issue kind=' */ });
it('검토 실패(timeout 포함)·고쳐 쓰기 실패·고쳐 쓴 초안 거절이면 원래 초안을 조립하고 reportError 를 부른다', async () => {
  // 세 경우: parse 3번째가 GenerationFailure('timeout') 던짐 / write 2번째가 던짐 / write 2번째가 {{code:S1}} 를 뺀 초안
});
it('남은 시간이 60초 미만이면 검토를, 90초 미만이면 고쳐 쓰기를 부르지 않는다', async () => { /* 59_999 → parse 2회; 89_999 → parse 3회 write 1회 */ });
it('바깥 펜스로 감싼 작성 결과도 검토 quote 를 찾아 고쳐 쓴다', async () => { /* … */ });
it('검토·고쳐 쓰기 사용량도 onUsage 로 보고한다', async () => { /* usage 길이 5 */ });
```

기존 테스트 '세 단계를 거쳐…' 등은 검토 응답 `{ issues: [] }` 를 추가해 그대로 통과시키고, '모든 Claude 호출의 사용량' 테스트는 호출 수에 맞게 고친다.

`estimate.test.ts`:

```ts
it('검토·고쳐 쓰기 입력·출력과 작성 재료의 코드 여유분을 더한다', () => {
  // 같은 입력에서 systemTokens.review=10, revise=20 일 때와 0 일 때의 차이 = 30
  // length 'medium' 결과 = 기존 식 + requestTokens + 2*ESTIMATE_ANALYSIS_OUTPUT + 3*ESTIMATE_OUTLINE_CODE
  //   + 3*ESTIMATE_WRITE_OUTPUT.medium + 2*ESTIMATE_REVIEW_OUTPUT + review + revise (기존 식을 테스트에 적어 비교)
});
```

`run-job.test.ts`: `createUsagePipeline` 에 `review` 를 더하고, 작성 뒤 검토 결과가 `complete` 로 저장되며 `markStep` 이 3을 기록하지 않는 테스트를 추가한다.

- [ ] **Step 2: 실행해 실패 확인** — `pnpm test` → FAIL.

- [ ] **Step 3: 구현**
  - `write` 는 `llm.write` 결과를 `{ ...analyzed, draft, selected }` 로 돌려준다 (assemble 은 `review` 로 옮김).
  - `review` 는 위 동작대로. `linkIds` 는 `new Set(links.map((l) => l.id))`. `reportError` 가 없으면 아무것도 하지 않는다.
  - `estimatePrepared` 는 `review`, `revise` system 토큰을 넘긴다. `estimateJobTokens` 에 스펙 6.5 의 항목을 더하고 주석 갱신:
    - 검토 입력 `requestTokens + ESTIMATE_ANALYSIS_OUTPUT + ESTIMATE_OUTLINE_CODE + ESTIMATE_WRITE_OUTPUT[length]`, 출력 `ESTIMATE_REVIEW_OUTPUT`
    - 고쳐 쓰기 입력 `ESTIMATE_ANALYSIS_OUTPUT + ESTIMATE_OUTLINE_CODE + ESTIMATE_WRITE_OUTPUT[length] + ESTIMATE_REVIEW_OUTPUT`, 출력 `ESTIMATE_WRITE_OUTPUT[length]`
    - 작성 입력의 코드 원문 `ESTIMATE_OUTLINE_CODE` 한 번 더
  - `run-job.ts` 의 `RunJobDependencies<P, C, A>` 에 `W` 를 더한다 (`pipeline: Pipeline<P, C, A, W>`). `runDraft`: `const written = await pipeline.write(input, analyzed); return pipeline.review(input, written);` (`review` 앞 `ensureTime` 없음, `advance` 없음). 주석의 단계 설명 갱신.
  - `placeholder-pipeline.ts`: `write` 는 지금 결과를 그대로 돌려주고 `review: async (_input, written) => written`.
  - `handler.ts`: `createClaudePipeline({ llm, fetchLinks, remainingTimeMs })`. handler 는 지금 `runJob` 에도 `reportError` 를 넘기지 않으므로 파이프라인에도 넘기지 않는다 (오류 보고 연결은 Sentry 작업 때 함께).
  - `pipeline.ts` 상단 주석의 단계 목록 갱신.

- [ ] **Step 4: 통과 확인** — `pnpm test && pnpm typecheck && pnpm build` → PASS (build 는 smoke 포함).

- [ ] **Step 5: 커밋** — `git commit -m "feat: 초안 작성 뒤 검토와 필요할 때만 고쳐 쓰기"`

---

### Task 6: comdraft 진행 단계 이름

**Files:**
- Modify: `components/studio/generation-progress.tsx`, `locales/ko.po`, `locales/en.po` (추출 결과)
- Test: 기존 테스트에 3단계 이름을 확인하는 곳이 있으면 갱신 (없으면 추가하지 않음)

- [ ] **Step 1: 브랜치 확인** — comdraft 는 이미 `feat/draft-review` (스펙 커밋 있음).
- [ ] **Step 2: 수정** — `STEP_LABELS[3]` 을 `` msg`작성·검토` `` 로. `pnpm i18n:extract` 후 `locales/en.po` 의 `msgid "작성·검토"` 에 `msgstr "Write & review"` 를 넣고 `pnpm i18n:compile`. 다른 곳에서 쓰는 `"작성"` 항목이 사라지면 그대로 둔다(추출 결과).
- [ ] **Step 3: 확인** — `pnpm test && pnpm typecheck && pnpm lint` → PASS.
- [ ] **Step 4: 커밋** — `git commit -m "feat: 진행 3단계 이름을 작성·검토로"`

---

## 실행 후 (계획 밖, 사용자 확인 필요)

- 로컬에서 실제 Claude 로 커밋 하나(번역 라이브러리 설정 커밋 + 문서 링크)를 돌려 전후 초안 비교 — 사용량이 들어 실행 전 확인.
- Lambda terraform plan 확인 후 apply, comdraft 병합·push — 각각 사용자 승인 후.
