# 게시 후 이동과 조회 수 집계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 게시 성공 시 게시글로 이동하고, 상세 화면 조회를 같은 사람 30일 1회·글쓴이 제외 규칙으로 `post_view` 에 기록한다.

**Architecture:** 규칙(viewer_key 만들기, 쿠키 값 검사, 상세 경로 판별)은 순수 함수. proxy 가 상세 요청에 익명 viewer 쿠키를 심고, 상세 화면의 클라이언트 컴포넌트가 열린 뒤 서버 액션을 호출, 액션은 트랜잭션 + advisory lock 안에서 30일 기록을 확인하고 한 줄 넣는다.

**Tech Stack:** Next.js 16 (proxy, Server Actions, `cookies()` 는 Promise), drizzle + drizzle-kit, vitest

**Spec:** `docs/superpowers/specs/2026-11-13-post-views-design.md`

## Global Constraints

- 조회 수는 어디에도 표시하지 않음, 핫 목록 만들지 않음
- 같은 `post_id + viewer_key` 는 30일에 한 번, 글쓴이 본인 제외
- 마이그레이션: `pnpm db:generate` 후 `pnpm db:migrate:local` 만 (운영 `db:migrate:prod` 금지)
- 앱 내부 이동은 `useLocalizedRouter` (`useRouter` 직접 사용 금지)
- 기록 실패는 화면에 알리지 않음, 콘솔 로그 남기지 않음

## Review Focus

- 비로그인 + viewer 쿠키 없음/형식 틀림 → 기록 안 함
- 글쓴이 로그인 상태 조회 → 기록 안 함
- 없는 글, 형식이 틀린 게시글 ID → 기록 안 함, 오류 없이 끝남
- 같은 사람이 거의 동시에 두 번 호출 → 한 줄만 (advisory lock)
- proxy 가 상세 경로가 아닌 곳(`/posts` 목록, 스튜디오)에는 쿠키를 넣지 않음, 이미 유효한 쿠키는 덮어쓰지 않음

---

### Task 1: 조회 규칙 순수 함수

**Files:**
- Create: `lib/posts/post-view.ts`
- Test: `lib/posts/post-view.test.ts`

**Interfaces:**
- Produces:
  - `POST_VIEW_WINDOW_DAYS = 30`
  - `VIEWER_COOKIE = 'comdraft-viewer'`, `VIEWER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365`
  - `isViewerId(value: string | undefined): value is string` — 소문자/대문자 UUID 형식
  - `getViewerKey(input: { sessionUserId: string | null; viewerId: string | undefined; authorId: string }): string | null` — 글쓴이면 null, 로그인이면 `user:{id}`, 아니면 유효한 쿠키일 때 `anon:{uuid}`, 그 밖 null
  - `isPostDetailPath(path: string): boolean` — 로케일 뗀 경로가 `/posts/{세그먼트 하나}` 일 때만 true

- [ ] **Step 1: 실패하는 테스트**

```ts
expect(getViewerKey({ sessionUserId: 'u1', viewerId: undefined, authorId: 'u1' })).toBeNull();
expect(getViewerKey({ sessionUserId: 'u1', viewerId: VALID, authorId: 'u2' })).toBe('user:u1');
expect(getViewerKey({ sessionUserId: null, viewerId: VALID, authorId: 'u2' })).toBe(`anon:${VALID}`);
expect(getViewerKey({ sessionUserId: null, viewerId: undefined, authorId: 'u2' })).toBeNull();
expect(getViewerKey({ sessionUserId: null, viewerId: 'abc', authorId: 'u2' })).toBeNull();
expect(isViewerId(VALID)).toBe(true); expect(isViewerId('x')).toBe(false); expect(isViewerId(undefined)).toBe(false);
expect(isPostDetailPath('/posts/abc-1234567890')).toBe(true);
for (const p of ['/posts', '/posts/', '/posts/a/b', '/dashboard']) expect(isPostDetailPath(p)).toBe(false);
```

- [ ] **Step 2:** `pnpm exec vitest run lib/posts/post-view.test.ts` → FAIL (모듈 없음)
- [ ] **Step 3:** 구현 (server-only, DB, Lingui import 금지)
- [ ] **Step 4:** 같은 명령 → PASS
- [ ] **Step 5:** 커밋 `feat: 게시글 조회 규칙`

### Task 2: `post_view` 테이블과 로컬 마이그레이션

**Files:**
- Modify: `lib/db/schema/post.ts` (`postView` 테이블 추가, 주석)
- Create: `drizzle/0022_*.sql`, `drizzle/meta/*` (generate 결과)

**Interfaces:**
- Produces: `postView` — `id text pk`(uuid, `$defaultFn(() => crypto.randomUUID())`), `postId text not null → post.id on delete cascade`, `viewerKey text not null`, `viewedAt timestamptz(3) default now() not null`; 색인 `post_view_post_viewer_idx (post_id, viewer_key, viewed_at desc)`, `post_view_post_viewed_idx (post_id, viewed_at)`

- [ ] **Step 1:** 스키마 추가 후 `pnpm db:generate` → 새 SQL 이 `create table "comdraft"."post_view"` 와 색인 2개, FK 만 담았는지 읽어서 확인
- [ ] **Step 2:** `pnpm db:migrate:local` → 성공, `psql -c "\d comdraft.post_view"` 로 컬럼·색인 확인
- [ ] **Step 3:** `pnpm exec tsc --noEmit -p .` 통과 후 커밋 `feat: 게시글 조회 기록 테이블`

### Task 3: 조회 기록 서버 액션

**Files:**
- Create: `lib/posts/views.ts` (server-only, `recordViewIfDue(postId, viewerKey): Promise<boolean>`)
- Create: `lib/actions/post-views.ts` (`'use server'`, `recordPostView(postId: string): Promise<void>`)

**Interfaces:**
- Consumes: Task 1 함수, `postView`, `isPostId`, `getSession`
- Produces: `recordPostView(postId)` — 반환값 없음, 모든 실패를 삼킴(try/catch)

- [ ] **Step 1:** `recordViewIfDue`: `db.transaction` 안에서 `select pg_advisory_xact_lock(hashtextextended(postId || ':' || viewerKey, 0))` → `viewed_at > now() - 30일` 기록 있으면 false → 없으면 insert 후 true
- [ ] **Step 2:** `recordPostView`: `isPostId` 아니면 끝 → 게시글 `userId` 조회(없으면 끝) → `getSession()` 과 `cookies()` 의 `VIEWER_COOKIE` 로 `getViewerKey` → null 이면 끝 → `recordViewIfDue`
- [ ] **Step 3:** 로컬 DB 에서 확인: 임시 스크립트(커밋 안 함)나 Task 5 브라우저 확인으로 대신함 — 이 단계는 `tsc`, `eslint` 통과만
- [ ] **Step 4:** 커밋 `feat: 게시글 조회 기록 액션`

### Task 4: 쿠키 심기와 상세 화면 기록

**Files:**
- Modify: `proxy.ts` (상세 경로 + 유효 쿠키 없음 → 응답에 `VIEWER_COOKIE` 설정: `crypto.randomUUID()`, httpOnly, sameSite lax, secure(운영), path `/`, maxAge 1년)
- Create: `components/posts/post-view-recorder.tsx` (client, `useEffect` 로 `recordPostView(postId)` 한 번, `null` 렌더)
- Modify: `app/[lang]/posts/[postPath]/page.tsx` (`<PostViewRecorder postId={post.id} />` 추가)

- [ ] **Step 1:** 구현. proxy 는 `NextResponse.next(...)` 결과에 `response.cookies.set` (리다이렉트 응답에는 넣지 않음)
- [ ] **Step 2:** `tsc`, `eslint . --ignore-pattern '.superpowers/**'` 통과
- [ ] **Step 3:** 커밋 `feat: 게시글 상세 조회 기록`

### Task 5: 게시 후 게시글로 이동

**Files:**
- Modify: `components/studio/publish-actions.tsx` (`result.status === 'published'` 분기에서 상태 반영·확인 창 닫은 뒤 `router.push(getPostPath({ id: result.id, slug: result.slug }))`)

- [ ] **Step 1:** 구현 (`useLocalizedRouter`)
- [ ] **Step 2:** `tsc`, `eslint` 통과, 커밋 `feat: 게시 후 게시글로 이동`

### Task 6: 화면 확인

- [ ] **Step 1:** 포트 3003 dev 서버. 로그인(글쓴이) 상태로 상세 열기 → `post_view` 줄 0
- [ ] **Step 2:** 비로그인 새 탭(쿠키 없는 상태: 브라우저에서 쿠키 삭제 또는 시크릿 대신 `document.cookie` 로 확인 불가하므로 `curl` 로 proxy 쿠키 확인 + 로그아웃 상태 브라우저)으로 상세 열기 → 1줄, 새로고침 → 그대로 1줄, `/posts` 목록 응답엔 viewer 쿠키 없음
- [ ] **Step 3:** 스튜디오에서 다시 게시 → 해당 글 상세로 이동 확인
- [ ] **Step 4:** 확인용 `post_view` 줄 삭제, 전체 vitest·eslint·tsc 통과
