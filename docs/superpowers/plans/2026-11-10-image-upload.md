# 이미지 업로드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 편집기에 넣은 이미지를 자동 저장할 때 sharp 로 WebP 변환해 Supabase Storage 에 올리고, 본문에는 공개 주소만 저장한다. 쓰지 않는 이미지는 기록 테이블로 정리한다.

**Architecture:**
- 브라우저는 `blob:` 주소로 보여 주다가 자동 저장 직전에 장마다 `requestImageUpload` → 임시 버킷 직접 업로드 → `finalizeImageUpload`(sharp 변환, 공개 버킷, `image` 행) 순서로 올리고 주소를 바꾼다.
- 허용 주소 검사와 이미지 노드 정리는 순수 함수(`lib/images/rules.ts`)로 두고 저장·게시·AI 반영에서 같은 함수를 쓴다.
- 정리(`lib/images/cleanup.ts`)는 그 초안의 `image` 행 가운데 초안·게시글 본문 어디에도 없는 것만 지운다. 기록된 경로만 지운다.

**Tech Stack:** Next.js 16 (Server Actions), Drizzle, Tiptap 3.33.0, sharp 0.35.4, @supabase/supabase-js 2.119, Lingui, Vitest, Tailwind v4, lucide

**Spec:** `docs/superpowers/specs/2026-11-10-image-upload-design.md`

## Global Constraints

- 작업 위치: `/Users/junmyeongjo/Workspace/comdraft` 의 `feat/image-upload` 브랜치. worktree 쓰지 않음.
- pnpm 은 11 (`/Users/junmyeongjo/.nvm/versions/node/v24.12.0/bin/pnpm`). 셸에서 `PATH=/Users/junmyeongjo/.nvm/versions/node/v24.12.0/bin:$PATH` 를 앞에 붙여 실행한다 (중첩 `pnpm` 호출도 11 로). `/Users/junmyeongjo/Library/pnpm/pnpm`(10) 은 쓰지 않는다.
- 검증 명령: `pnpm test` (vitest run), `pnpm exec tsc --noEmit`, `pnpm exec eslint . --ext .ts,.tsx,.js,.jsx`.
- 구현자는 `db:migrate*` 를 실행하지 않는다. 마이그레이션 적용과 버킷 생성은 컨트롤러가 한다 (사용자 허락됨).
- 상수 (spec 그대로):
  - 형식 MIME: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif`. sharp 형식: `jpeg`, `png`, `webp`, `gif`, `avif`
  - HEIC(`image/heic`, `image/heif`, 확장자 `.heic`/`.heif`, sharp `heif`) 는 "HEIC 형식은 지원하지 않습니다" 로 거부
  - 원본 최대 5MB (`5 * 1024 * 1024`), 초안당 최대 10장
  - WebP 품질 80, 가로 최대 1280px (`withoutEnlargement`), `limitInputPixels` 40_000_000, 애니메이션 유지(`animated: true`)
  - 버킷: 공개 `comdraft-images`, 임시 `comdraft-uploads`
  - 경로: 공개 `{userId}/{imageId}.webp`, 임시 `{userId}/{uploadId}` (`imageId`, `uploadId` 는 UUID)
  - 정리 유예 10분 (초안 삭제 때는 유예 없음)
- 허용 이미지 주소: `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comdraft-images/${userId}/${uuid}.webp` 이고 `userId` 가 그 초안의 사용자. 이미지 노드 속성은 `src`, `alt`(문자열, 200자까지), `width`, `height`(양의 정수) 만.
- `SUPABASE_SECRET_KEY` 는 `server-only` 모듈에서만 읽는다. 키 값을 출력·로그하지 않는다.
- 화면 문구는 Lingui. 영문 번역을 채우고 `pnpm i18n:extract`, `pnpm i18n:compile` 실행.
- Tailwind v4, 클래스는 문자열 그대로 (동적 조합 금지). 아이콘은 lucide.
- 디버그 `console` 금지. 주석은 한국어.
- 커밋: 한국어 제목, 빈 줄, `- ` 본문, 빈 줄, `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **저장 직전 경합**: 방금 올린 이미지를 본문 저장 전에 다른 정리가 지우면 안 된다. 10분 유예를 `findUnusedImages` 테스트가 고정한다 (Task 2).
2. **남의 경로·외부 주소 주입**: 다른 사용자의 버킷 경로, 외부 주소, `blob:`, `data:` 이미지가 DB 나 게시글에 남으면 안 된다. 저장·게시·AI 반영 세 곳 모두 같은 `removeDisallowedImages` 를 거친다 (Task 2, 5).
3. **업로드 실패 중 자동 저장**: `blob:` 이미지는 저장 본문에서 빠지고, 편집기에는 남아 다음 저장 때 다시 시도된다 (Task 7).
4. **가짜 형식과 큰 해상도**: 확장자만 바꾼 파일, HEIC, 아주 큰 해상도는 sharp 단계에서 거부된다 (Task 3).
5. **초안 삭제**: 게시글까지 함께 지워질 때 그 초안 이미지 파일과 행이 모두 지워진다 (Task 5).

---

### Task 1: `image` 테이블과 의존성

**Files:**
- Create: `lib/db/schema/image.ts`, `drizzle/0017_*.sql` (생성), `drizzle/meta/*`
- Modify: `lib/db/schema/index.ts`, `package.json` (sharp 직접 의존성), `pnpm-workspace.yaml` (필요하면 `allowBuilds.sharp`)

**Interfaces:**
- Produces: `image` 테이블 (`id` text PK, `userId` text not null → `user.id` cascade, `draftId` text null → `draft.id` set null, `path` text not null unique, `width`/`height`/`bytes` integer not null, `createdAt` timestamptz(3) default now). 인덱스 `image_draft_idx(draft_id)`, `image_user_created_idx(user_id, created_at)`. `type ImageRow = typeof image.$inferSelect`.

- [ ] **Step 1:** 스키마 작성 (기존 스키마 파일의 주석·스타일).
- [ ] **Step 2:** `pnpm add sharp@0.35.4` (lockfile 에 이미 있는 버전). 설치 후 `node -e "require('sharp')"` 가 되는지 확인하고, pnpm 11 이 빌드 스크립트 승인을 요구하면 `pnpm-workspace.yaml` 의 `allowBuilds` 에 `sharp: true` 를 넣는다.
- [ ] **Step 3:** `pnpm db:generate` 로 0017 생성. SQL 에 `image` 생성, FK 2개, unique, 인덱스 2개만 있는지 확인.
- [ ] **Step 4:** 검증 명령 통과.
- [ ] **Step 5:** 커밋 `feat: 이미지 기록 테이블과 sharp 의존성`
- [ ] **Step 6 (컨트롤러):** 0017 을 로컬·운영에 적용하고, 버킷 두 개를 만든다 (`storage.buckets`: `comdraft-images` public, `comdraft-uploads` private + `file_size_limit` 5242880 + `allowed_mime_types` 다섯 개).

---

### Task 2: 이미지 규칙 순수 함수

**Files:**
- Create: `lib/images/rules.ts`, `lib/images/rules.test.ts`

**Interfaces:**
- Produces:
  - 상수 `IMAGE_MAX_BYTES`, `IMAGE_MAX_PER_DRAFT`, `IMAGE_ACCEPTED_MIME_TYPES`, `IMAGE_CLEANUP_GRACE_MS`(10분), `IMAGE_BUCKET`, `IMAGE_UPLOAD_BUCKET`
  - `type ImageFileCheck = { ok: true } | { ok: false; reason: 'heic' | 'type' | 'size' }`
  - `checkImageFile(file: { type: string; name: string; size: number }): ImageFileCheck` (HEIC 는 MIME 이나 확장자로 판정, 우선 `heic`)
  - `getImagePath(userId: string, imageId: string): string`, `getUploadPath(userId: string, uploadId: string): string`
  - `getImagePublicUrl(supabaseUrl: string, path: string): string`
  - `parseImagePath(supabaseUrl: string, src: string, userId: string): string | null` (허용 주소면 버킷 안 경로, 아니면 null)
  - `removeDisallowedImages(doc: JSONContent, allow: (src: string) => boolean): JSONContent` (허용 안 되는 image 노드 제거, 허용 노드는 `src`/`alt`/`width`/`height` 만 정리해 남김)
  - `collectImageSrcs(doc: JSONContent | null): string[]`
  - `findUnusedImages(images: { id: string; path: string; createdAt: Date }[], usedPaths: Set<string>, now: Date, options?: { grace: boolean }): { id: string; path: string }[]` (기본 `grace: true`)

- [ ] **Step 1: 실패하는 테스트**

```ts
const URL_BASE = 'https://ref.supabase.co';
const USER = 'user-1';
const ID = '3f2b8c1e-1a2b-4c3d-8e9f-0a1b2c3d4e5f';
const ok = `${URL_BASE}/storage/v1/object/public/comdraft-images/${USER}/${ID}.webp`;
it('파일 검사', () => {
  expect(checkImageFile({ type: 'image/png', name: 'a.png', size: 5 * 1024 * 1024 })).toEqual({ ok: true });
  expect(checkImageFile({ type: 'image/png', name: 'a.png', size: 5 * 1024 * 1024 + 1 })).toEqual({ ok: false, reason: 'size' });
  expect(checkImageFile({ type: 'image/heic', name: 'a.heic', size: 10 })).toEqual({ ok: false, reason: 'heic' });
  expect(checkImageFile({ type: '', name: 'IMG_1.HEIC', size: 10 })).toEqual({ ok: false, reason: 'heic' });
  expect(checkImageFile({ type: 'image/svg+xml', name: 'a.svg', size: 10 })).toEqual({ ok: false, reason: 'type' });
});
it('허용 주소', () => {
  expect(parseImagePath(URL_BASE, ok, USER)).toBe(`${USER}/${ID}.webp`);
  expect(parseImagePath(URL_BASE, ok, 'user-2')).toBeNull();
  expect(parseImagePath(URL_BASE, 'https://evil.example/a.webp', USER)).toBeNull();
  expect(parseImagePath(URL_BASE, 'blob:http://localhost/x', USER)).toBeNull();
  expect(parseImagePath(URL_BASE, 'data:image/png;base64,AAA', USER)).toBeNull();
  expect(parseImagePath(URL_BASE, `${ok}?x=1`, USER)).toBeNull();
  expect(parseImagePath(URL_BASE, ok.replace(ID, '../other'), USER)).toBeNull();
});
it('허용 안 되는 이미지 제거와 속성 정리', () => {
  const doc = { type: 'doc', content: [
    { type: 'image', attrs: { src: ok, alt: 'a', width: 640, height: 480, title: 'x', onerror: 'y' } },
    { type: 'image', attrs: { src: 'blob:http://localhost/x' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
  ] };
  const cleaned = removeDisallowedImages(doc, (src) => src === ok);
  expect(cleaned.content).toEqual([
    { type: 'image', attrs: { src: ok, alt: 'a', width: 640, height: 480 } },
    { type: 'paragraph', content: [{ type: 'text', text: 'hi' }] },
  ]);
});
it('정리 대상: 안 쓰이고 유예가 지난 것만', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  const images = [
    { id: 'a', path: 'u/a.webp', createdAt: new Date('2026-11-10T11:00:00Z') },
    { id: 'b', path: 'u/b.webp', createdAt: new Date('2026-11-10T11:55:00Z') },
    { id: 'c', path: 'u/c.webp', createdAt: new Date('2026-11-10T11:00:00Z') },
  ];
  expect(findUnusedImages(images, new Set(['u/c.webp']), now)).toEqual([{ id: 'a', path: 'u/a.webp' }]);
  expect(findUnusedImages(images, new Set(['u/c.webp']), now, { grace: false })).toEqual([{ id: 'a', path: 'u/a.webp' }, { id: 'b', path: 'u/b.webp' }]);
});
```

  - `collectImageSrcs` 는 중첩 노드(목록 안 등)의 image 도 모으는 테스트를 추가한다.
- [ ] **Step 2:** 실패 확인 `pnpm test lib/images/rules.test.ts`
- [ ] **Step 3:** 구현. server-only, Lingui import 없음.
- [ ] **Step 4:** 통과 확인, 전체 검증.
- [ ] **Step 5:** 커밋 `feat: 이미지 형식·주소·정리 규칙`

---

### Task 3: sharp 변환

**Files:**
- Create: `lib/images/convert.ts`, `lib/images/convert.test.ts`

**Interfaces:**
- Consumes: Task 2 상수
- Produces:
  - `class UnsupportedImageError extends Error { reason: 'heic' | 'type' | 'too_large' }`
  - `convertToWebp(input: Buffer): Promise<{ data: Buffer; width: number; height: number; bytes: number }>`

- [ ] **Step 1: 실패하는 테스트** — 테스트 안에서 sharp 로 입력 이미지를 만든다 (파일 fixture 없이).
  - 2000×1000 PNG → 결과 format `webp`, width 1280, height 640
  - 300×200 JPEG → width 300 (키우지 않음)
  - EXIF orientation 6 이 있는 400×200 JPEG (`withMetadata({ orientation: 6 })`) → 결과 width 200, height 400, 결과 `metadata().exif` 없음
  - 3프레임 GIF (`sharp({ create }, ...).gif()` 로 animated 입력 만들기, 또는 `join` 사용) → 결과 `metadata().pages === 3`, height 는 한 프레임 높이
  - PNG 바이트에 확장자만 다른 경우는 의미 없으므로, 대신 텍스트 바이트(`Buffer.from('not an image')`) → `UnsupportedImageError('type')`
  - SVG 입력(`<svg ...>`) → `UnsupportedImageError('type')`
  - `limitInputPixels` 초과(예: 8000×6000 PNG) → `UnsupportedImageError('too_large')`
- [ ] **Step 2:** 실패 확인
- [ ] **Step 3:** 구현 (spec 5.1). sharp 의 `metadata()` 로 형식을 먼저 확인하고 `heif` 는 `heic`, 허용 목록 밖은 `type` 으로 거부. 픽셀 초과 sharp 오류는 `too_large` 로 바꾼다. `server-only` import.
- [ ] **Step 4:** 통과 확인 (vitest 환경이 happy-dom 이면 이 파일만 `// @vitest-environment node`).
- [ ] **Step 5:** 커밋 `feat: sharp WebP 변환`

---

### Task 4: Storage 클라이언트와 업로드 액션

**Files:**
- Create: `lib/supabase/server.ts`, `lib/images/storage.ts`, `lib/actions/images.ts`

**Interfaces:**
- Consumes: Task 1 `image`, Task 2 규칙·상수, Task 3 `convertToWebp`
- Produces:
  - `getServerSupabase(): SupabaseClient` (server-only, `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SECRET_KEY`, 세션 저장 안 함, 없으면 throw)
  - `storage.ts`: `createUploadUrl(path): Promise<{ signedUrl: string; token: string }>`, `downloadUpload(path): Promise<Buffer>`, `removeUploads(paths)`, `putImage(path, data)`, `removeImages(paths): Promise<boolean>`
  - `requestImageUpload(repositoryId: string, draftId: string): Promise<{ status: 'ok'; uploadId: string; path: string; token: string } | { status: 'limit' } | { status: 'locked' } | { status: 'not_found' }>`
  - `finalizeImageUpload(repositoryId: string, draftId: string, uploadId: string): Promise<{ status: 'ok'; src: string; width: number; height: number } | { status: 'unsupported'; reason: 'heic' | 'type' | 'too_large' } | { status: 'limit' } | { status: 'locked' } | { status: 'not_found' } | { status: 'failed' }>`

- [ ] **Step 1:** 소유·잠금 검사는 `saveDraftContent` 와 같은 조건(`isOwnedDraft`, `syncDraftJobs`, `lockingJobExists`)을 재사용한다. 공통 부분이 필요하면 `lib/studio` 에 작은 helper 로 뽑는다.
- [ ] **Step 2:** `requestImageUpload`: 그 초안의 `image` 행 수 ≥ 10 이면 `limit`. 아니면 `uploadId = crypto.randomUUID()`, 임시 경로로 `createSignedUploadUrl`. 브라우저는 `getBrowserSupabase().storage.from(IMAGE_UPLOAD_BUCKET).uploadToSignedUrl(path, token, file)` 로 올린다.
- [ ] **Step 3:** `finalizeImageUpload`: `uploadId` UUID 형식 검사, 경로는 세션 사용자 것만, 장 수 다시 검사, 원본 다운로드 → `convertToWebp` → `putImage` → `image` 행 insert → `removeUploads`. 변환 거부면 원본을 지우고 `unsupported`. 그 밖 오류는 원본을 지우고 `failed`.
- [ ] **Step 4:** 검증 명령 통과 (DB/Storage 호출은 단위 테스트하지 않음).
- [ ] **Step 5:** 커밋 `feat: 이미지 업로드 주소 발급과 변환 업로드`

---

### Task 5: 저장·게시·AI 반영의 주소 검사와 정리

**Files:**
- Create: `lib/images/cleanup.ts`
- Modify: `lib/studio/editor-schema.ts` (이미지 확장), `lib/posts/post-content.ts` (`sanitizePostContent` 에 이미지), `lib/posts/post-content.test.ts`, `lib/actions/studio.ts` (`saveDraftContent`, `deleteDraft`), `lib/actions/posts.ts` (`publishDraft`, `unpublishDraft`), `lib/generation/jobs.ts` (`applyCompletedJob`), `lib/generation/markdown.ts` (필요 시)

**Interfaces:**
- Consumes: Task 2, Task 4 `removeImages`
- Produces:
  - 문서 스키마에 `image` 노드 (`@tiptap/extension-image@3.33.0`, `inline: false`, `allowBase64: false`, 속성 `src`/`alt`/`width`/`height`)
  - `sanitizePostContent(doc, options: { imageOwnerId: string; supabaseUrl: string })` — image 노드는 `removeDisallowedImages` 규칙과 같게
  - `cleanupDraftImages(draftId: string, options?: { grace: boolean }): Promise<void>` (그 초안의 `image` 행, 초안 본문과 게시글 본문의 사용 경로로 `findUnusedImages` → `removeImages` 성공 시 행 삭제)
  - `removeDraftImages(paths: string[], ids: string[])` 또는 초안 삭제 흐름 안의 동등 처리

- [ ] **Step 1: 실패하는 테스트** (`post-content.test.ts`): 허용 이미지 유지와 속성 정리, 다른 사용자 경로·외부 주소 이미지 제거, `alt` 200자 자르기 또는 거부(정한 쪽 고정), `width` 음수·문자열 제거.
- [ ] **Step 2:** 실패 확인
- [ ] **Step 3:** 구현
  - `saveDraftContent`: 파싱 후 `removeDisallowedImages`(그 사용자 허용) → 저장 → `cleanupDraftImages(draftId)`.
  - `publishDraft` / `unpublishDraft`: 정리된 본문으로 게시, 끝나면 `cleanupDraftImages`.
  - `applyCompletedJob`: Markdown 변환 결과에 `removeDisallowedImages` → 반영 후 `cleanupDraftImages` (트랜잭션 밖).
  - `deleteDraft`: 삭제 전에 그 초안 `image` 행을 모으고, 삭제 후 `removeImages` → 행 삭제 (`grace: false` 와 같은 효과).
  - 정리 실패는 저장 결과를 바꾸지 않는다 (잡아서 무시하지 말고, 다음 정리 때 다시 시도되도록 행을 남기는 것으로 충분).
  - 게시글 렌더링: `components/posts/post-content.tsx` 에 image 노드 → `<img src alt width height loading="lazy" decoding="async" className=...>` (최대 폭 100%, 높이 auto).
  - `extractPostExcerpt` 는 이미지를 건너뛴다 (테스트 하나).
- [ ] **Step 4:** 검증 명령 통과
- [ ] **Step 5:** 커밋 `feat: 본문 이미지 주소 검사와 쓰지 않는 이미지 정리`

---

### Task 6: 편집기 이미지 넣기와 자동 저장 업로드

**Files:**
- Create: `hooks/use-pending-images.ts` (또는 `components/studio/` 아래), 필요하면 `components/studio/image-upload.ts` (업로드 순서 함수)
- Modify: `components/studio/editor-toolbar.tsx` (이미지 버튼), `components/studio/editor-extensions.ts` (붙여넣기·끌어다 놓기), `components/studio/draft-editor.tsx` (자동 저장 전 업로드, 실패 안내, `beforeunload`, 게시 전 확인), `locales/*`

**Interfaces:**
- Consumes: Task 2 `checkImageFile`·상수, Task 4 액션, Task 5 스키마
- Produces: 화면 동작 (spec 4장)

- [ ] **Step 1:** 순수 helper 로 뽑을 수 있는 부분(문서에서 `blob:` 이미지 빼기 = `removeDisallowedImages(doc, src => !src.startsWith('blob:'))`, 장 수 세기)은 Task 2 함수를 재사용하고, 새 로직이 생기면 테스트를 단다.
- [ ] **Step 2:** 넣기
  - 툴바 버튼(lucide `ImagePlus` 또는 `Image`, `aria-label` "이미지 넣기"), 숨긴 `<input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif,.heic,.heif">` (HEIC 도 고를 수 있게 해서 안내).
  - 붙여넣기·끌어다 놓기는 Tiptap `editorProps.handlePaste` / `handleDrop` 에서 파일만 가로챈다.
  - 검사 실패 안내 (편집기 상단 기존 안내 영역 또는 토스트 자리, 임시 디자인):
    - heic: "HEIC 형식은 지원하지 않습니다"
    - type: "JPEG, PNG, WebP, GIF, AVIF 이미지만 넣을 수 있습니다"
    - size: "이미지는 한 장에 5MB 까지 넣을 수 있습니다"
    - limit: "초안 하나에 이미지는 10장까지 넣을 수 있습니다"
  - 통과하면 `URL.createObjectURL`, 대기 목록에 `blob → File`, 이미지 노드 삽입 (`alt` = 파일 이름에서 확장자 뺀 값).
- [ ] **Step 3:** 자동 저장 연동 (`draft-editor.tsx` 의 flush)
  - 저장 전에 본문의 `blob:` src 중 대기 목록에 있는 것을 차례로 올린다 (request → `uploadToSignedUrl` → finalize).
  - 성공하면 편집기 문서에서 그 src 를 공개 주소로 바꾸고(`width`/`height` 도) 대기 목록에서 빼고 `revokeObjectURL`.
  - 실패하면 "이미지를 올리지 못했습니다. 다시 시도합니다" (`unsupported` 면 형식 안내 후 그 이미지를 편집기에서 제거).
  - 저장 본문은 `blob:` 이미지를 뺀 문서.
  - 대기 목록에 없는 `blob:` (새로고침 등으로 잃은 것)는 편집기에서 제거한다.
- [ ] **Step 4:** 업로드 중이거나 남은 `blob:` 이미지가 있으면 `beforeunload` 로 막는다. 게시 버튼은 마무리 저장 후에도 `blob:` 이미지가 남으면 게시하지 않고 "올리지 못한 이미지가 있습니다" 안내.
- [ ] **Step 5:** 편집기 이미지 스타일 (최대 폭 100%, 선택 시 테두리) 임시 디자인. HTML 내보내기는 `<img>`, MD 내보내기(`editor.getMarkdown()`)는 `![alt](공개 주소)` 로 나오는지 확인하고, 안 나오면 이미지 확장의 Markdown 직렬화를 맞춘다. 내보내기 전에도 마무리 저장으로 `blob:` 을 공개 주소로 바꾼 뒤 내보낸다.
- [ ] **Step 6:** i18n extract → en 번역 → compile.
- [ ] **Step 7:** 검증 명령 통과
- [ ] **Step 8:** 커밋 `feat: 편집기 이미지 넣기와 자동 저장 업로드`

---

### Task 7: 마무리 확인 (컨트롤러)

- [ ] **Step 1:** 전체 테스트, 타입 검사, 린트, `pnpm build`.
- [ ] **Step 2:** 로컬 브라우저: PNG 넣기 → 자동 저장 후 src 가 공개 주소 → 새로고침 후 유지 → 게시글에 표시 → 본문에서 지우고 10분 유예를 SQL 로 앞당긴 뒤 저장하면 Storage 파일과 `image` 행 삭제. HEIC·5MB 초과·11번째 이미지 안내. 움직이는 GIF 표시. 테스트 데이터 정리.
- [ ] **Step 3:** 사용자 확인 후 main 병합과 push.
