# 초안 게시 기능 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스튜디오 초안을 comdraft 공개 피드와 상세 페이지에 게시·다시 게시·게시 취소할 수 있게 한다.

**Architecture:** 별도 `comdraft.post` 테이블에 게시 시점 본문 스냅샷을 저장한다(초안 1 : 게시글 0..1, cascade). 규칙(ID, slug, 주소 해석, 게시 가능 검사, 본문 정리, 요약)은 `lib/posts/` 순수 함수로 두고, 서버 액션 `lib/actions/posts.ts` 가 트랜잭션으로 저장한다. 공개 페이지는 `@tiptap/static-renderer` 로 서버에서 React 요소를 만든다.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM (postgres-js), Tiptap 3.33.0, Lingui, Tailwind v4, Vitest

**Spec:** `docs/superpowers/specs/2026-11-10-post-publishing-design.md`

## Global Constraints

- Next.js 16 은 학습 데이터와 다르다. `generateMetadata`, `permanentRedirect`, `notFound`, `sitemap.ts`, 동적 params(Promise) 를 쓰기 전에 `node_modules/next/dist/docs/` 의 해당 문서를 읽는다.
- 스타일은 Tailwind v4, 아이콘은 lucide 만 쓴다. 공개 페이지 화면은 Figma 를 받기 전 임시 구현이므로 기존 스튜디오·대시보드 스타일(`components/studio/studio-styles.ts` 등)을 재사용한다.
- 모든 화면 문구는 Lingui(`msg`/`Trans`/`useLingui`)로 쓰고 UI 작업 끝에 `pnpm run i18n:extract` → `locales/en.po` 영문 번역 채우기 → `pnpm run i18n:compile` 을 한다.
- 링크는 eslint 규칙대로 `LocalizedLink`/`LocalizedAnchor`/`localizedRedirect` 를 쓴다.
- `pnpm db:migrate`, `db:migrate:prod` 는 절대 실행하지 않는다. `pnpm db:generate` 로 파일만 만들고 사용자에게 적용을 요청한다.
- 새 의존성은 `@tiptap/static-renderer` 정확히 `3.33.0` 하나뿐이다.
- pnpm 은 `/Users/junmyeongjo/.nvm/versions/node/v24.12.0/bin/pnpm`(11.x)을 쓴다. 기본 pnpm 10 은 store 오류가 난다.
- 디버그용 `console` 을 남기지 않는다.
- 커밋 메시지는 `feat:`/`fix:`/`docs:` + 한국어 제목, 빈 줄, `- ` 목록 본문, 빈 줄, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 값: 짧은 ID 10자 `[0-9A-Za-z]`, slug 최대 60자, 요약 최대 160자, 피드 페이지 크기 20, 공개 범위 `'public' | 'unlisted'`, 로케일 `'ko' | 'en'`.

## Review Focus

1. **자동 저장 대기·진행 중에 게시**: 게시 직후 뒤늦은 자동 저장이 상태를 '임시'로 되돌리면 안 된다. 게시 전에 대기 중인 저장을 버리고 진행 중인 저장이 끝나기를 기다린다 (Task 5 Step 3, 브라우저 확인 Task 5 Step 8).
2. **macOS 한글 자모 분리(NFD) 제목**: 같은 제목이 다른 slug 가 되면 안 된다. slug 는 NFC 정규화 후 만든다 (Task 2 테스트).
3. **기호·이모지만 있는 제목**: slug 가 비면 주소는 ID 만 쓴다 (Task 2 테스트).
4. **조작된 공개 범위 값**(`'private'` 등): 서버 액션이 `invalid` 로 거절한다 (Task 4 테스트).
5. **코드 블록이나 제목으로 시작하는 본문**: 요약은 문단(paragraph) 글자만 쓰고 코드·제목은 건너뛴다 (Task 3 테스트).

---

### Task 1: post 테이블과 draft.visibility 이동

**Files:**
- Create: `lib/db/schema/post.ts`
- Modify: `lib/db/schema/index.ts`, `lib/db/schema/draft.ts:36-39,66`, `lib/studio/queries.ts:38-44,95-108,151-165`, `components/studio/draft-status.ts`, `components/studio/draft-editor.tsx:395-400`
- Create (generated): `drizzle/0012_*.sql`
- Test: `components/studio/draft-status.test.ts`

**Interfaces:**
- Produces:
  - `post` 테이블 (spec 3.1 컬럼 그대로, 이름 `id, draftId, userId, title, slug, excerpt, content, visibility, locale, publishedAt, updatedAt`), 인덱스 `post_public_published_idx`, check `post_visibility_check`, `post_locale_check`
  - `POST_VISIBILITIES = ['public', 'unlisted'] as const`, `type PostVisibility` (post.ts 에서 export, `DRAFT_VISIBILITIES`/`DraftVisibility` 삭제)
  - `StudioDraftSummary.visibility: PostVisibility | null` (post left join 결과)
  - `getDraftStatusLabel(status: DraftStatus, visibility: PostVisibility | null): MessageDescriptor`

- [ ] **Step 1: 실패하는 테스트 작성** — `draft-status.test.ts`

```ts
it('게시 상태는 공개 범위 라벨', () => {
  expect(getDraftStatusLabel('published', 'public')).toBe(VISIBILITY_LABELS.public);
  expect(getDraftStatusLabel('published', 'unlisted')).toBe(VISIBILITY_LABELS.unlisted);
});
it('임시와 초안', () => {
  expect(getDraftStatusLabel('temporary', 'public').message).toBe('임시');
  expect(getDraftStatusLabel('draft', null).message).toBe('초안');
});
it('비공개 라벨이 없다', () => {
  expect(Object.keys(VISIBILITY_LABELS)).toEqual(['public', 'unlisted']);
});
```

(`VISIBILITY_LABELS` 를 export 한다. msg 디스크립터 비교 방식은 기존 테스트의 Lingui 설정을 따른다.)

- [ ] **Step 2: 실패 확인** — Run: `pnpm vitest run components/studio/draft-status.test.ts` / Expected: FAIL (`VISIBILITY_LABELS` 미export 또는 키 3개)

- [ ] **Step 3: 스키마와 라벨 구현**
  - `post.ts`: 테이블 정의. `draftId` 는 `.unique().references(() => draft.id, { onDelete: 'cascade' })`, `userId` 는 `user.id` cascade. 인덱스는 `index('post_public_published_idx').on(table.publishedAt.desc(), table.id.desc()).where(sql\`${table.visibility} = 'public'\`)`. 타임스탬프는 draft 와 같이 `withTimezone: true, precision: 3`, `updatedAt` 은 `.defaultNow().notNull()` (`$onUpdate` 없음, 다시 게시 때 명시적으로 설정).
  - `draft.ts`: `visibility` 컬럼과 `DRAFT_VISIBILITIES` 삭제, 상태 주석의 '비공개' 제거.
  - `queries.ts`: `listStudioDrafts`, `getStudioDraft` 가 `leftJoin(post, eq(post.draftId, draft.id))` 로 `visibility: post.visibility` 를 읽는다.
  - `draft-status.ts`: 라벨 두 개로 줄이고 `VISIBILITY_LABELS` export.

- [ ] **Step 4: 마이그레이션 생성** — Run: `pnpm db:generate` / Expected: `drizzle/0012_*.sql` 에 `CREATE TABLE "comdraft"."post"`, 인덱스, check 2개, `ALTER TABLE "comdraft"."draft" DROP COLUMN "visibility"` 가 있다. 다른 변경이 섞이지 않았는지 확인.

- [ ] **Step 5: 확인** — Run: `pnpm vitest run && pnpm tsc --noEmit && pnpm lint` / Expected: 모두 통과

- [ ] **Step 6: 커밋** — `feat: 게시글 post 테이블 추가와 공개 범위 이동`

- [ ] **Step 7: 사용자에게 로컬 마이그레이션 적용 요청** — 0012 를 로컬 DB 에 적용해 달라고 요청하고 기다린다 (이후 Task 의 브라우저 확인에 필요). 직접 실행하지 않는다.

---

### Task 2: 짧은 ID와 주소 규칙

**Files:**
- Create: `lib/posts/post-id.ts`, `lib/posts/post-path.ts`
- Test: `lib/posts/post-id.test.ts`, `lib/posts/post-path.test.ts`

**Interfaces:**
- Produces:
  - `POST_ID_LENGTH = 10`, `createPostId(): string`, `isPostId(value: string): boolean`
  - `POST_SLUG_MAX_LENGTH = 60`, `createPostSlug(title: string): string`
  - `getPostPath(post: { id: string; slug: string }): string` → `/posts/{slug}-{id}` 또는 `/posts/{id}` (로케일 없는 경로, 링크 컴포넌트가 로케일을 붙임)
  - `parsePostPath(segment: string): { id: string; slug: string } | null` (URL 디코드된 세그먼트를 받음)

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// post-id.test.ts
it('10자 영숫자', () => {
  for (let i = 0; i < 200; i++) expect(createPostId()).toMatch(/^[0-9A-Za-z]{10}$/);
});
it('isPostId', () => {
  expect(isPostId('a1B2c3D4e5')).toBe(true);
  expect(isPostId('a1B2c3D4e')).toBe(false);
  expect(isPostId('a1B2c3D4e-')).toBe(false);
});

// post-path.test.ts
it('한글 유지, 기호는 -', () => {
  expect(createPostSlug('Sharp 로 이미지 최적화하기!')).toBe('sharp-로-이미지-최적화하기');
});
it('연속 기호 정리와 앞뒤 제거', () => {
  expect(createPostSlug('  --Next.js 16 :: proxy.ts--  ')).toBe('next-js-16-proxy-ts');
});
it('NFD 제목도 NFC 와 같은 slug', () => {
  expect(createPostSlug('이미지'.normalize('NFD'))).toBe(createPostSlug('이미지'));
});
it('60자에서 자르고 끝 - 제거', () => {
  const slug = createPostSlug(`${'a'.repeat(59)} b`);
  expect(slug).toBe('a'.repeat(59));
});
it('쓸 글자가 없으면 빈 값', () => {
  expect(createPostSlug('🚀 !!! ???')).toBe('');
});
it('getPostPath', () => {
  expect(getPostPath({ id: 'a1B2c3D4e5', slug: 'sharp' })).toBe('/posts/sharp-a1B2c3D4e5');
  expect(getPostPath({ id: 'a1B2c3D4e5', slug: '' })).toBe('/posts/a1B2c3D4e5');
});
it('parsePostPath', () => {
  expect(parsePostPath('sharp-로-이미지-a1B2c3D4e5')).toEqual({ id: 'a1B2c3D4e5', slug: 'sharp-로-이미지' });
  expect(parsePostPath('a1B2c3D4e5')).toEqual({ id: 'a1B2c3D4e5', slug: '' });
  expect(parsePostPath('sharp-short')).toBeNull();
  expect(parsePostPath('')).toBeNull();
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm vitest run lib/posts` / Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현**
  - `createPostId`: `crypto.getRandomValues` 로 바이트를 뽑아 62자 알파벳에 매핑한다. 편향을 없애려고 `byte < 248` 인 값만 쓴다 (248 = 62×4).
  - `createPostSlug`: `normalize('NFC')` → `toLowerCase()` → `/[^\p{L}\p{N}]+/gu` 를 `-` 로 → 앞뒤 `-` 제거 → 60자 자르기 → 끝 `-` 제거.
  - `parsePostPath`: 마지막 `-` 기준으로 나누고 ID 가 `isPostId` 를 통과해야 한다.

- [ ] **Step 4: 통과 확인** — Run: `pnpm vitest run lib/posts` / Expected: PASS

- [ ] **Step 5: 커밋** — `feat: 게시글 짧은 ID와 주소 규칙`

---

### Task 3: 게시 가능 검사, 본문 정리, 요약

**Files:**
- Create: `lib/posts/post-content.ts`
- Test: `lib/posts/post-content.test.ts`

**Interfaces:**
- Consumes: `extractDraftTitle(doc)` (`lib/studio/draft-content.ts`), `createDraftSchemaExtensions()` (`lib/studio/editor-schema.ts`), `draftBlank` 노드 이름 (`lib/studio/draft-blank-node.ts`)
- Produces:
  - `type PublishCheck = { status: 'ok'; title: string } | { status: 'has_blanks'; count: number } | { status: 'no_title' }`
  - `checkPublishable(doc: JSONContent): PublishCheck` (빈칸 검사가 제목 검사보다 먼저)
  - `sanitizePostContent(doc: JSONContent): JSONContent`
  - `POST_EXCERPT_MAX_LENGTH = 160`, `extractPostExcerpt(doc: JSONContent): string`

- [ ] **Step 1: 실패하는 테스트 작성** (문서는 테스트 안의 작은 빌더 `doc(...)`, `p(text)`, `h(level, text)` 로 만든다)

```ts
it('빈칸이 남아 있으면 개수', () => {
  expect(checkPublishable(doc(h(1, '제목'), blank(), blank()))).toEqual({ status: 'has_blanks', count: 2 });
});
it('제목이 없으면 no_title', () => {
  expect(checkPublishable(doc(p('본문')))).toEqual({ status: 'no_title' });
});
it('통과하면 제목', () => {
  expect(checkPublishable(doc(h(1, '제목'), p('본문')))).toEqual({ status: 'ok', title: '제목' });
});
it('javascript: 링크는 마크만 지우고 글자는 남긴다', () => {
  const out = sanitizePostContent(doc(p(link('클릭', 'javascript:alert(1)'))));
  expect(out.content?.[0].content?.[0]).toEqual({ type: 'text', text: '클릭' });
});
it('http, https, mailto 링크는 유지', () => {
  for (const href of ['http://a.com', 'https://a.com', 'mailto:a@a.com']) {
    const out = sanitizePostContent(doc(p(link('a', href))));
    expect(out.content?.[0].content?.[0].marks?.[0].attrs?.href).toBe(href);
  }
});
it('스키마에 없는 노드와 속성은 버린다', () => {
  const out = sanitizePostContent(doc({ type: 'iframe', attrs: { src: 'x' } }, { type: 'paragraph', attrs: { onclick: 'x' }, content: [{ type: 'text', text: 'a' }] }));
  expect(out).toEqual(doc(p('a')));
});
it('정상 문서는 그대로', () => {
  const input = doc(h(2, '제목'), p('본문'), codeBlock('ts', 'const a = 1;'));
  expect(sanitizePostContent(input)).toEqual(input);
});
it('요약은 문단 글자만, 코드·제목 건너뜀', () => {
  expect(extractPostExcerpt(doc(h(1, '제목'), codeBlock('ts', 'x'), p('첫 문단'), p('둘째')))).toBe('첫 문단 둘째');
});
it('요약 160자 자르기', () => {
  expect(extractPostExcerpt(doc(p('가'.repeat(200))))).toHaveLength(160);
});
it('문단이 없으면 빈 값', () => {
  expect(extractPostExcerpt(doc(h(1, '제목')))).toBe('');
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm vitest run lib/posts/post-content.test.ts` / Expected: FAIL

- [ ] **Step 3: 구현**
  - `sanitizePostContent`: `getSchema(createDraftSchemaExtensions())` 로 ProseMirror 스키마를 만들고 JSON 을 재귀로 걸러 낸다. 스키마에 없는 노드는 버리고, 노드·마크 속성은 스키마 spec 에 정의된 키만 남긴다. 링크 마크의 `href` 는 `new URL(href).protocol` 이 `http:`/`https:`/`mailto:` 가 아니면(또는 파싱 실패면) 마크를 지운다. 마지막에 `schema.nodeFromJSON(result).toJSON()` 으로 구조를 검증한다.
  - `extractPostExcerpt`: 최상위 `paragraph` 노드의 글자를 공백 하나로 이어 붙이고 공백을 정리한 뒤 160자에서 자른다.

- [ ] **Step 4: 통과 확인** — Run: `pnpm vitest run lib/posts` / Expected: PASS

- [ ] **Step 5: 커밋** — `feat: 게시 가능 검사와 게시 본문 정리, 요약 추출`

---

### Task 4: 게시·게시 취소 서버 액션과 자동 저장 상태 변경

**Files:**
- Create: `lib/posts/post-values.ts`, `lib/actions/posts.ts`
- Modify: `lib/actions/studio.ts:98-157` (`saveDraftContent`), `lib/studio/draft-content.ts` (`parseDraftDocument` 를 studio.ts 에서 옮겨 export)
- Test: `lib/posts/post-values.test.ts`

**Interfaces:**
- Consumes: Task 1 `post`, `PostVisibility`; Task 2 `createPostId`, `createPostSlug`, `getPostPath`; Task 3 `checkPublishable`, `sanitizePostContent`, `extractPostExcerpt`; `requireSession`, `isOwnedDraft`, `syncDraftJobs`, `lockingJobExists`; `Locale` (`lib/i18n/config.ts`)
- Produces:
  - `parsePostVisibility(value: unknown): PostVisibility | null`
  - `buildPostValues(content: JSONContent, title: string, locale: Locale, visibility: PostVisibility): { title; slug; excerpt; content; visibility; locale }`
  - `parseDraftDocument(contentJson: unknown): JSONContent | null` (`lib/studio/draft-content.ts`)
  - `type PublishDraftResult = { status: 'published'; path: string; visibility: PostVisibility } | { status: 'has_blanks'; count: number } | { status: 'no_title' } | { status: 'invalid' } | { status: 'locked' } | { status: 'not_found' }`
  - `publishDraft(repositoryId: string, draftId: string, contentJson: string, visibility: PostVisibility, locale: Locale): Promise<PublishDraftResult>`
  - `type UnpublishDraftResult = { status: 'unpublished' } | { status: 'locked' } | { status: 'not_found' }`
  - `unpublishDraft(repositoryId: string, draftId: string): Promise<UnpublishDraftResult>`
  - `SaveDraftContentResult` 의 `saved` 에 `draftStatus: DraftStatus` 추가

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('공개 범위는 public, unlisted 만', () => {
  expect(parsePostVisibility('public')).toBe('public');
  expect(parsePostVisibility('unlisted')).toBe('unlisted');
  expect(parsePostVisibility('private')).toBeNull();
  expect(parsePostVisibility(undefined)).toBeNull();
});
it('게시 값 조립', () => {
  const content = doc(h(1, 'Sharp 최적화'), p('본문'), p(link('x', 'javascript:x')));
  const values = buildPostValues(content, 'Sharp 최적화', 'ko', 'unlisted');
  expect(values).toMatchObject({ title: 'Sharp 최적화', slug: 'sharp-최적화', excerpt: '본문 x', visibility: 'unlisted', locale: 'ko' });
  expect(JSON.stringify(values.content)).not.toContain('javascript:');
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm vitest run lib/posts/post-values.test.ts` / Expected: FAIL

- [ ] **Step 3: `post-values.ts` 구현** — `buildPostValues` 는 `sanitizePostContent` 결과로 요약을 만든다.

- [ ] **Step 4: 통과 확인** — Run: `pnpm vitest run lib/posts` / Expected: PASS

- [ ] **Step 5: 서버 액션 구현** (`'use server'`)
  - `publishDraft`: 순서는 spec 5.1. `parsePostVisibility` 실패나 로케일이 `LOCALES` 밖이면 `invalid`. `checkPublishable` 결과가 `ok` 가 아니면 그대로 반환. 트랜잭션에서
    1. `draft` UPDATE (`content`, `title`, `status: 'published'`) — 조건은 `saveDraftContent` 와 같은 `not(lockingJobExists(draft.id))`, 0행이면 `locked` 반환(트랜잭션 롤백 없이 종료).
    2. `post` insert `{ id: createPostId(), draftId, userId, ...buildPostValues(...) }` `.onConflictDoUpdate({ target: post.draftId, set: { title, slug, excerpt, content, visibility, locale, updatedAt: sql\`now()\` } })` `.returning({ id, slug, visibility })`.
  - 반환 `path` 는 `getPostPath(row)`.
  - `unpublishDraft`: AI 작성 중이면 `locked`(`isDraftLocked`). 트랜잭션에서 `post` 삭제(`draftId`), 0행이면 `not_found`, 있으면 `draft.status = 'draft'`.
  - `saveDraftContent`: `.set({ content, title, status: sql\`case when ${draft.status} = 'published' then 'temporary' else ${draft.status} end\` })`, `.returning({ id, status })`, 결과에 `draftStatus` 포함.

- [ ] **Step 6: 확인** — Run: `pnpm vitest run && pnpm tsc --noEmit && pnpm lint` / Expected: 통과

- [ ] **Step 7: 커밋** — `feat: 초안 게시와 게시 취소 서버 액션`

---

### Task 5: 스튜디오 게시 확인 창과 버튼 상태

**Files:**
- Create: `components/studio/publish-dialog.tsx`, `components/studio/publish-actions.tsx`, `components/studio/publish-state.ts`
- Modify: `components/studio/studio-context.tsx` (게시 상태 덮어쓰기), `components/studio/draft-editor.tsx:89-178,395-445` (자동 저장 `settle`, 버튼 교체, 상태 라벨), `components/studio/draft-list-item.tsx` (라벨), `lib/studio/queries.ts` (`StudioRepository.isPrivate`, `StudioDraft.post` — Task 1 의 post left join 에서 `id`, `slug` 도 읽음)
- Test: `components/studio/publish-state.test.ts`

**Interfaces:**
- Consumes: Task 4 `publishDraft`, `unpublishDraft`, `PublishDraftResult`, `SaveDraftContentResult.draftStatus`; Task 2 `getPostPath`; `countEmptyBlanks`; `useLocale` (`hooks/use-locale.ts`)
- Produces:
  - `StudioRepository.isPrivate: boolean`, `StudioDraft.post: { id: string; slug: string; visibility: PostVisibility } | null`
  - `type DraftPublishState = { status: DraftStatus; post: { id: string; slug: string; visibility: PostVisibility } | null }`
  - studio context: `draftPublishStates: Readonly<Record<string, DraftPublishState>>`, `setDraftPublishState(draftId: string, state: DraftPublishState): void`, `setDraftStatus(draftId: string, status: DraftStatus): void` (`draftTitles` 와 같은 덮어쓰기 패턴)
  - `getPublishActions(state: DraftPublishState): { primary: 'publish' | 'republish'; canView: boolean; canUnpublish: boolean }`
  - `useDraftAutosave` 반환에 `settle(): Promise<void>` 추가

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('게시 전에는 게시하기만', () => {
  expect(getPublishActions({ status: 'draft', post: null })).toEqual({ primary: 'publish', canView: false, canUnpublish: false });
});
it('게시·임시는 다시 게시, 글 보기, 게시 취소', () => {
  const post = { id: 'a1B2c3D4e5', slug: 's', visibility: 'public' as const };
  for (const status of ['published', 'temporary'] as const) {
    expect(getPublishActions({ status, post })).toEqual({ primary: 'republish', canView: true, canUnpublish: true });
  }
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm vitest run components/studio/publish-state.test.ts` / Expected: FAIL

- [ ] **Step 3: 구현**
  - `settle()`: 타이머를 지우고 `pendingRef` 를 버린 뒤(게시가 같은 본문을 저장함), 진행 중인 저장이 있으면 끝날 때까지 기다린다 (진행 중 저장의 Promise 를 ref 에 보관).
  - 자동 저장 성공 시 `setDraftStatus(draftId, result.draftStatus)`.
  - `PublishDialog`: `reference-link-dialog.tsx` 와 같은 네이티브 `<dialog>` 모달. 공개 범위 라디오(공개 기본, 다시 게시면 현재 값), `isPrivate` 면 경고 문구 "비공개 저장소의 코드가 본문에 그대로 공개됩니다", 빈칸이 있으면 "빈칸 N개를 채운 뒤 게시할 수 있습니다" 와 함께 게시 버튼 비활성. 서버가 `has_blanks`/`no_title`/`locked` 를 돌려주면 창 안에 사유 표시 ("본문에 제목을 넣어 주세요", "AI 작성 중에는 게시할 수 없습니다").
  - 게시 흐름: `await settle()` → `publishDraft(repositoryId, draftId, JSON.stringify(editor.getJSON()), visibility, locale)` → 성공 시 `setDraftPublishState` 로 `{ status: 'published', post }`, 창 닫기.
  - `PublishActions`: `getPublishActions` 결과로 "게시하기"/"다시 게시" 버튼과, 게시 후 "글 보기"(`LocalizedAnchor` 새 탭, `getPostPath`) · "게시 취소" 메뉴(lucide 아이콘, 기존 초안 메뉴 스타일). 게시 취소는 확인 창("게시를 취소하면 공개 주소가 더 이상 열리지 않습니다") 후 `unpublishDraft`.
  - 잠금(`isLocked`)이나 초안 없음이면 모두 비활성.
  - 편집기 상단 라벨과 사이드바 목록 라벨은 context 덮어쓰기 값을 우선 쓴다.

- [ ] **Step 4: 통과 확인** — Run: `pnpm vitest run && pnpm tsc --noEmit && pnpm lint` / Expected: 통과

- [ ] **Step 5: 문구 카탈로그** — `pnpm run i18n:extract`, `locales/en.po` 새 항목 영문 번역, `pnpm run i18n:compile`

- [ ] **Step 6: 브라우저 확인 (로컬, 0012 적용 후)** — `pnpm dev`(3003)로 스튜디오에서: 빈칸 남은 초안 게시 막힘 → 빈칸 완료 후 게시 → 라벨 '게시 · 공개' → 한 글자 수정 후 '임시' → 다시 게시 → '게시' → 게시 취소 → '초안'

- [ ] **Step 7: 커밋** — `feat: 스튜디오 게시 확인 창과 다시 게시, 게시 취소`

- [ ] **Step 8: 자동 저장 경합 확인 (Review Focus 1)** — 글자를 입력하고 자동 저장 지연(1초) 안에 바로 게시 → 몇 초 뒤에도 라벨이 '게시' 이고 새로고침해도 '게시' 인지 확인. 실패하면 `settle` 을 고치고 다시 커밋한다.

---

### Task 6: 게시글 상세 페이지와 본문 렌더러

**Files:**
- Create: `components/posts/post-content.tsx`, `app/[lang]/posts/[postPath]/page.tsx`, `lib/posts/metadata.ts`
- Create: `lib/posts/queries.ts` (server-only, `getPublishedPost`)
- Modify: `components/studio/draft-editor.tsx:33-60` (`PROSE_CLASS` 를 `components/shared/prose.ts` 로 옮겨 export), `package.json` (`@tiptap/static-renderer` 3.33.0)
- Test: `components/posts/post-content.test.tsx`, `lib/posts/metadata.test.ts`

**Interfaces:**
- Consumes: Task 2 `parsePostPath`, `getPostPath`; `createDraftSchemaExtensions`; `PROSE_CLASS` (`components/shared/prose.ts`, 이 Task 에서 편집기에서 옮김)
- Produces:
  - `getPublishedPost(id: string): Promise<PublishedPost | null>` — `PublishedPost = { id; slug; title; excerpt; content: JSONContent; visibility: PostVisibility; locale: Locale; publishedAt: Date; updatedAt: Date; author: { name: string; image: string | null } }` (`user` inner join)
  - `PostContent({ content }: { content: JSONContent })` 서버 컴포넌트
  - `buildPostMetadata(post: PublishedPost, origin: string): Metadata`

- [ ] **Step 1: 의존성 추가** — Run: `pnpm add @tiptap/static-renderer@3.33.0` (정확한 버전 고정)

- [ ] **Step 2: 실패하는 테스트 작성**

```tsx
it('제목, 코드 블록, 링크를 그린다', () => {
  const html = renderToStaticMarkup(<PostContent content={doc(h(2, '소제목'), codeBlock('ts', 'const a = 1;'), p(link('문서', 'https://a.com')))} />);
  expect(html).toContain('<h2');
  expect(html).toContain('const a = 1;');
  expect(html).toContain('href="https://a.com"');
  expect(html).toContain('rel="noopener noreferrer nofollow"');
});

// metadata.test.ts
it('공개 글은 대표 주소와 article', () => {
  const meta = buildPostMetadata(post({ visibility: 'public', locale: 'en', slug: 's', id: 'a1B2c3D4e5' }), 'https://comdraft.vercel.app');
  expect(meta.alternates?.canonical).toBe('https://comdraft.vercel.app/en/posts/s-a1B2c3D4e5');
  expect(meta.openGraph).toMatchObject({ type: 'article' });
  expect(meta.robots).toBeUndefined();
});
it('일부 공개는 noindex', () => {
  expect(buildPostMetadata(post({ visibility: 'unlisted' }), 'https://x').robots).toEqual({ index: false });
});
```

- [ ] **Step 3: 실패 확인** — Run: `pnpm vitest run components/posts lib/posts/metadata.test.ts` / Expected: FAIL

- [ ] **Step 4: 구현**
  - `PostContent`: `@tiptap/static-renderer` 의 React 렌더러(`renderToReactElement`)에 `createDraftSchemaExtensions()` 와 `content` 를 넘기고 편집기와 같은 prose 클래스 컨테이너로 감싼다.
  - 페이지: `params` 의 `postPath` 를 `decodeURIComponent` 후 `parsePostPath` → 실패하면 `notFound()` → `getPublishedPost` 없으면 `notFound()` → 요청 slug 가 `post.slug` 와 다르면 `permanentRedirect` (로케일 붙인 `getPostPath`, 기존 `localizedRedirect` 계열 헬퍼 사용). 헤더에 제목, 작성자 이름·아바타(`next/image`), 게시일, 다시 게시했다면 수정일.
  - `generateMetadata` 는 같은 조회를 React `cache` 로 감싸 한 번만 한다. origin 은 이미 로컬·운영에 있는 `BETTER_AUTH_URL`(앱 주소)을 쓴다.

- [ ] **Step 5: 통과 확인** — Run: `pnpm vitest run && pnpm tsc --noEmit && pnpm lint` / Expected: 통과

- [ ] **Step 6: 문구 카탈로그** — Task 5 Step 5 와 같다.

- [ ] **Step 7: 브라우저 확인** — Task 5 에서 게시한 글을 열어 본문 모양이 편집기와 같은지, 제목을 바꿔 다시 게시한 뒤 예전 주소가 새 주소로 이동하는지, 게시 취소 후 404 인지 확인

- [ ] **Step 8: 커밋** — `feat: 게시글 상세 페이지와 본문 렌더러`

---

### Task 7: 전체 피드와 사이트맵

**Files:**
- Create: `app/[lang]/posts/page.tsx`, `components/posts/post-feed.tsx`, `components/posts/post-card.tsx`, `lib/posts/feed-cursor.ts`, `app/sitemap.ts`
- Modify: `lib/posts/queries.ts` (`getPostFeedPage`, `listPublicPostPaths`), `lib/actions/posts.ts` (`loadPostFeed`)
- Test: `lib/posts/feed-cursor.test.ts`

**Interfaces:**
- Consumes: Task 2 `getPostPath`; 대시보드 무한 스크롤 패턴(`components/dashboard/repository-list.tsx`, `lib/dashboard/queries.ts` 의 base64url 커서)
- Produces:
  - `POST_FEED_PAGE_SIZE = 20`
  - `encodeFeedCursor(cursor: { publishedAt: Date; id: string }): string`, `decodeFeedCursor(value: string): { publishedAt: Date; id: string } | null`
  - `type PostFeedItem = { id; slug; title; excerpt; publishedAt: Date; author: { name: string; image: string | null } }`
  - `getPostFeedPage(cursor: string | null): Promise<{ posts: PostFeedItem[]; nextCursor: string | null }>` — `visibility = 'public'`, `(published_at, id) < 커서` , `published_at desc, id desc`, `limit 21`
  - `loadPostFeed(cursor: string): Promise<...>` (로그인 불필요 서버 액션)
  - `listPublicPostPaths(): Promise<{ id; slug; locale: Locale; updatedAt: Date }[]>`

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
it('커서 왕복', () => {
  const cursor = { publishedAt: new Date('2026-11-10T01:02:03.456Z'), id: 'a1B2c3D4e5' };
  expect(decodeFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor);
});
it('잘못된 커서는 null', () => {
  expect(decodeFeedCursor('not-base64-json')).toBeNull();
  expect(decodeFeedCursor(Buffer.from('{"publishedAt":"x","id":"a"}').toString('base64url'))).toBeNull();
});
```

- [ ] **Step 2: 실패 확인** — Run: `pnpm vitest run lib/posts/feed-cursor.test.ts` / Expected: FAIL

- [ ] **Step 3: 구현**
  - 피드 페이지: 서버에서 첫 페이지를 그리고 `PostFeed`(클라이언트)가 `IntersectionObserver` 로 `loadPostFeed` 를 부른다. 글이 없으면 빈 상태 문구 "아직 게시된 글이 없습니다".
  - `PostCard`: 제목, 요약, 작성자 이름·아바타, 게시일, 상세 링크(`LocalizedLink` + `getPostPath`).
  - `app/sitemap.ts`: 메인(`/ko`, `/en`), 피드(`/ko/posts`, `/en/posts`), 공개 글 대표 주소(`/{locale}{getPostPath}`, `lastModified: updatedAt`). 일부 공개 글은 넣지 않는다.

- [ ] **Step 4: 통과 확인** — Run: `pnpm vitest run && pnpm tsc --noEmit && pnpm lint` / Expected: 통과

- [ ] **Step 5: 문구 카탈로그** — Task 5 Step 5 와 같다.

- [ ] **Step 6: 브라우저 확인** — 공개 글이 피드에 보이고 일부 공개 글은 안 보이는지, 다시 게시해도 순서가 그대로인지, `/sitemap.xml` 에 공개 글만 있는지 확인. 스크롤 확인용 글이 부족하면 확인 동안만 `POST_FEED_PAGE_SIZE` 를 줄여 보고 되돌린다.

- [ ] **Step 7: 커밋** — `feat: 게시글 전체 피드와 사이트맵`

---

### Task 8: 초안 삭제·저장소 연결 해제 확인 창

**Files:**
- Create: `components/shared/confirm-dialog.tsx`, `components/dashboard/disconnect-repository-form.tsx`
- Modify: `components/studio/draft-list-item.tsx` (삭제 전 확인), `app/[lang]/dashboard/repositories/[repositoryId]/page.tsx:55-65`, `lib/posts/queries.ts` (`countRepositoryContent`)
- Test: 없음 (순수 로직 없음, 브라우저 확인)

**Interfaces:**
- Consumes: `useDraftDeletion` (`hooks/use-draft-deletion.ts`), `disconnectRepository` (변경 없음), Task 5 `draftPublishStates`/`StudioDraftSummary.visibility`
- Produces:
  - `ConfirmDialog({ open, title, description, confirmLabel, tone: 'danger', onConfirm, onClose })` — 네이티브 `<dialog>` 모달
  - `countRepositoryContent(userId: string, repositoryId: string): Promise<{ drafts: number; posts: number }>`

- [ ] **Step 1: 구현**
  - 초안 삭제: 메뉴의 삭제를 누르면 확인 창 "이 초안을 삭제할까요?", 게시한 초안(목록 라벨이 게시·임시)이면 "게시글도 함께 삭제되고 공개 주소가 더 이상 열리지 않습니다" 를 덧붙인다. 확인하면 기존 `removeDraft`.
  - 연결 해제: 페이지에서 `countRepositoryContent` 를 조회해 클라이언트 폼에 넘기고, 제출 전에 확인 창 "초안 {drafts}개와 게시글 {posts}개가 함께 삭제됩니다" (둘 다 0이면 "연결을 해제할까요?") 를 띄운 뒤 `requestSubmit()`.

- [ ] **Step 2: 확인** — Run: `pnpm vitest run && pnpm tsc --noEmit && pnpm lint` / Expected: 통과

- [ ] **Step 3: 문구 카탈로그** — Task 5 Step 5 와 같다.

- [ ] **Step 4: 브라우저 확인** — 게시한 초안 삭제 시 안내 문구와 삭제 후 상세 404, 연결 해제 확인 창의 개수가 실제와 같은지(취소하면 아무것도 지워지지 않는지) 확인

- [ ] **Step 5: 커밋** — `feat: 초안 삭제와 저장소 연결 해제 확인 창`

---

### Task 9: 마무리 확인

- [ ] **Step 1:** Run: `pnpm vitest run && pnpm tsc --noEmit && pnpm lint && pnpm build` / Expected: 모두 통과
- [ ] **Step 2:** spec 9장 브라우저 확인 목록을 처음부터 한 번 더 돈다 (로그아웃 상태에서 피드·상세가 열리는지 포함).
- [ ] **Step 3:** 사용자에게 운영 반영 순서를 알린다: 운영 DB 에 0012 마이그레이션 적용(사용자, 필요하면 임시 권한) → 그 뒤 push. 마이그레이션 전에 push 하면 스튜디오 조회가 없는 `post` 테이블을 읽어 실패한다.
