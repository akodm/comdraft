# 초안 게시 기능 설계

- 작성일: 2026-11-10
- 상태: 브레인스토밍 합의 완료, 구현 전
- 대상: comdraft 게시 데이터(`post` 테이블), 게시 서버 액션, 공개 피드와 상세 페이지, 삭제 확인 창

## 1. 목적과 성공 기준

스튜디오에서 다듬은 초안을 **comdraft 안의 공개 페이지에 게시**한다. 외부 블로그(Velog, Tistory 등) 연동은 이번 범위가 아니다.

- 모든 사용자의 공개 글을 최신순으로 보여 주는 **서비스 전체 피드**가 있다.
- 게시글마다 로그인 없이 열리는 **상세 페이지**가 있다.
- 공개 글은 **게시한 시점의 본문 스냅샷**이다. 초안을 계속 고쳐도 "다시 게시"를 눌러야 반영된다. 쓰다 만 글이나 빈칸이 공개되지 않는다.
- 화면 디자인(피드, 상세, 게시 확인 창, 삭제 확인 창)은 Figma 로 나중에 받는다. 이번 설계는 데이터, 주소, 게시 흐름을 정하고 화면은 기존 스타일로 임시 구현한다.

## 2. 핵심 결정 요약

| 주제 | 결정 |
|---|---|
| 게시 위치 | comdraft 안 (`/[lang]/posts`, `/[lang]/posts/{slug}-{id}`) |
| 목록 범위 | 서비스 전체 피드 (공개 글만, `published_at` 최신순) |
| 저장 방식 | 별도 `post` 테이블에 본문 스냅샷 저장 (초안 1 : 게시글 0..1) |
| 수정 반영 | 다시 게시할 때만 |
| 초안 상태 | 초안(게시 전·게시 취소 후) / 임시(게시 후 수정함) / 게시(게시·다시 게시 직후) |
| 공개 범위 | 공개(피드·검색 노출) / 일부 공개(주소로만 열림, 피드·검색 제외). 비공개는 없애고 게시 취소로 대신한다 |
| 주소 | 제목 slug + 짧은 ID. ID 로만 찾고, slug 가 다르면 308 로 올바른 주소로 이동 |
| 게시 취소 | `post` 행 삭제. 다시 게시하면 새 ID 를 받는다 (예전 링크는 404) |
| 삭제 | 초안 삭제, 저장소 연결 해제, 회원 탈퇴 시 게시글도 cascade 로 함께 삭제. 확인 창에서 미리 알린다 |
| 피드 언어 | 화면 언어와 관계없이 모든 공개 글을 보여 준다 |

## 3. 데이터 구조

### 3.1 새 테이블 `comdraft.post`

| 컬럼 | 타입 | 내용 |
|---|---|---|
| `id` | text PK | 짧은 ID. 영문 대소문자와 숫자 10자 (`crypto.getRandomValues`, 새 라이브러리 없음) |
| `draft_id` | text not null unique | `draft.id` 참조, on delete cascade |
| `user_id` | text not null | `user.id` 참조, on delete cascade. 피드·상세의 작성자 표시용 |
| `title` | text not null | 게시할 때 본문 첫 제목에서 뽑은 제목 (`extractDraftTitle`) |
| `slug` | text not null | 제목에서 만든 slug. 비어 있을 수 있다 |
| `excerpt` | text not null | 본문 첫 문단 글자 약 160자. 피드 카드와 페이지 설명용 |
| `content` | jsonb not null | 정리(4.4)를 거친 본문 스냅샷 (Tiptap JSON) |
| `visibility` | text not null | `'public'` 또는 `'unlisted'` (check 제약) |
| `locale` | text not null | 게시할 때의 화면 언어 `'ko'` 또는 `'en'` (check 제약). 대표 주소(canonical) 언어 |
| `published_at` | timestamptz(3) not null | 처음 게시한 시각. 피드 정렬 기준이며 다시 게시해도 바뀌지 않는다 |
| `updated_at` | timestamptz(3) not null | 마지막으로 다시 게시한 시각 |

인덱스:

- `post_public_published_idx`: `(published_at desc, id desc)` where `visibility = 'public'` (피드 커서 조회)
- `draft_id` unique 제약이 초안별 조회 인덱스를 겸한다.

### 3.2 `draft` 테이블 변경

- `draft.visibility` 컬럼을 삭제한다. 지금은 값을 넣는 곳이 없어 모두 null 이다. 공개 범위는 `post.visibility` 로 옮긴다.
- `DRAFT_VISIBILITIES` 를 `['public', 'unlisted']` 로 줄이고 `'게시 · 비공개'` 라벨을 지운다.
- `draft.status` 는 그대로 쓴다. 사이드바 상태 라벨(`getDraftStatusLabel`)은 `post.visibility` 를 함께 읽어 만든다. 스튜디오 초안 조회(`lib/studio/queries.ts`)는 `post` 를 left join 한다.

### 3.3 마이그레이션

마이그레이션 하나에 `post` 테이블 생성과 `draft.visibility` 삭제를 담는다. 로컬과 운영 적용은 사용자가 직접 한다 (운영은 기존처럼 임시 권한 부여가 필요할 수 있다).

## 4. 주소 규칙

### 4.1 형태

`/[lang]/posts/{slug}-{id}`. slug 가 비면 `/[lang]/posts/{id}`.

예: `/ko/posts/sharp-이미지-최적화-a1b2c3d4e5`

### 4.2 slug 만들기 (`createPostSlug`)

1. 소문자로 바꾼다.
2. 유니코드 글자(`\p{L}`)와 숫자(`\p{N}`)만 남기고 나머지는 `-` 로 바꾼다.
3. 연속된 `-` 를 하나로 줄이고 앞뒤 `-` 를 지운다.
4. 60자에서 자르고, 잘린 끝의 `-` 를 다시 지운다.

### 4.3 주소 해석 (`parsePostPath`)

- 마지막 `-` 뒤를 ID 로 본다. `-` 가 없으면 전체가 ID 다.
- ID 가 10자 영숫자가 아니면 404.
- 글은 ID 로만 찾는다. 요청한 slug 가 현재 slug 와 다르면 `permanentRedirect` 로 올바른 주소로 보낸다 (제목을 바꿔 다시 게시해도 예전 링크가 이어진다).

### 4.4 게시할 때 본문 정리 (`sanitizePostContent`)

자동 저장은 클라이언트가 보낸 JSON 을 그대로 저장하므로, 게시할 때 한 번 정리한 결과를 스냅샷으로 남긴다.

- 링크 마크는 `http:`, `https:`, `mailto:` 만 남긴다. 그 밖의 링크(`javascript:` 등)는 마크를 지우고 글자만 남긴다.
- 게시 스키마(`createDraftSchemaExtensions`)에 없는 노드와 마크는 버리고, 정의되지 않은 속성은 지운다.

## 5. 게시 흐름

### 5.1 서버 액션 (`lib/actions/posts.ts`)

세 액션 모두 기존 스튜디오 액션과 같은 순서로 먼저 확인한다: `requireSession` → `isOwnedDraft` → `syncDraftJobs` → AI 작성 중이면 `locked`.

**`publishDraft(repositoryId, draftId, contentJson, visibility)`** (게시와 다시 게시 모두)

1. `contentJson` 을 `saveDraftContent` 와 같은 규칙으로 해석한다. 형식이 틀리면 `invalid`.
2. `checkPublishable(content)`:
   - 빈칸 노드(`draftBlank`)가 하나라도 남아 있으면 `{ status: 'has_blanks', count }`
   - 제목이 없으면 `{ status: 'no_title' }`
3. 트랜잭션 하나에서:
   - 초안 본문과 제목을 저장한다 (자동 저장이 끝나기 전에 게시해도 화면 내용 그대로 게시되도록). 잠금 조건은 `saveDraftContent` 와 같다.
   - `post` 를 upsert 한다 (`on conflict (draft_id) do update`). 다시 게시면 `title`, `slug`, `excerpt`, `content`, `visibility`, `locale`, `updated_at` 만 바꾸고 `id`, `published_at` 은 유지한다.
   - `draft.status = 'published'`.
4. `{ status: 'published', path }` 를 돌려준다.

`visibility` 는 `'public' | 'unlisted'` 만 받는다. `locale` 은 요청한 화면 언어다.

**`unpublishDraft(repositoryId, draftId)`**

- 트랜잭션에서 `post` 행을 지우고 `draft.status = 'draft'` 로 되돌린다. 게시글이 없으면 `not_found`.

**`saveDraftContent` 변경**

- 같은 UPDATE 에서 `status = case when status = 'published' then 'temporary' else status end` 로 바꾼다. 쿼리를 따로 보내지 않는다.

### 5.2 스튜디오 화면

- 게시 전: "게시하기" 버튼을 누르면 게시 확인 창이 열린다.
  - 공개 범위 선택 (공개 / 일부 공개, 기본값 공개)
  - 저장소가 비공개(`github_repository.is_private`)이면 "비공개 저장소의 코드가 본문에 그대로 공개됩니다" 경고를 띄운다. 화면에서만 확인받고 서버에서 막지 않는다.
  - 남은 빈칸이 있으면 개수를 보여 주고 게시 버튼을 막는다. 서버가 `has_blanks` 를 돌려줘도 같은 안내를 보여 준다.
- 게시 후: 버튼이 "다시 게시"로 바뀐다 (확인 창은 현재 공개 범위로 채워 연다). 메뉴에 "글 보기"(상세 페이지 새 탭)와 "게시 취소"가 생긴다.
- AI 작성 중에는 게시 관련 버튼도 다른 편집 기능처럼 잠근다.

### 5.3 캐시

피드와 상세는 요청마다 렌더링한다 (게시, 다시 게시, 취소 시 캐시 무효화가 필요 없다). 트래픽이 생기면 캐시 태그를 도입한다. 스튜디오 화면은 액션 결과로 클라이언트 상태를 갱신한다.

## 6. 공개 페이지

로그인 없이 열린다. `proxy.ts` 의 보호 경로(`/dashboard`, `/onboarding`)에 해당하지 않아 변경할 것이 없다.

### 6.1 피드 `/[lang]/posts`

- 공개 글만 20개씩, `(published_at, id)` 커서 기반 무한 스크롤 (대시보드와 같은 방식). 새 글이 올라와도 중복이나 누락이 없다.
- 카드: 제목, 요약(`excerpt`), 작성자 이름과 아바타, 게시일.

### 6.2 상세 `/[lang]/posts/{slug}-{id}`

- 공개와 일부 공개 모두 열린다. 없는 ID 는 `notFound()`.
- 본문은 `@tiptap/static-renderer`(3.33.0, 새 의존성)로 서버에서 React 요소로 렌더링한다.
  - 편집기와 같은 스키마 확장(`createDraftSchemaExtensions`)과 같은 Tailwind Typography 클래스를 쓴다.
  - `dangerouslySetInnerHTML` 을 쓰지 않는다. DOM 없이 동작한다.
  - 코드 블록은 편집기처럼 색 강조 없이 언어 표시만 한다.
- 작성자 이름과 아바타, 게시일, (다시 게시했다면) 수정일을 보여 준다.

### 6.3 검색·공유

- `generateMetadata`: 제목, 설명(`excerpt`), 대표 주소(`/{post.locale}/posts/{slug}-{id}`), Open Graph(`type: 'article'`, 게시일, 수정일, 작성자).
- 일부 공개 글은 `robots: { index: false }`.
- `app/sitemap.ts` 를 추가한다: 메인, 피드(언어별), 공개 글의 대표 주소.
- OG 이미지는 디자인을 받은 뒤 추가한다.

## 7. 삭제 규칙

게시글은 `draft_id`, `user_id` cascade 로 DB 가 함께 지운다. 서버 삭제 로직은 바꾸지 않고, 확인 창으로 미리 알린다.

- **초안 삭제**: 확인 창을 새로 추가한다 (지금은 확인 없이 삭제됨). 게시한 초안이면 "게시글도 함께 삭제되고 공개 주소가 더 이상 열리지 않습니다"를 덧붙인다.
- **저장소 연결 해제** (`disconnectRepository`): 대시보드의 바로 제출되는 폼에 확인 창을 추가한다. 이 사용자의 해당 저장소 초안 수와 게시글 수를 세어 "초안 N개와 게시글 M개가 함께 삭제됩니다"를 보여 준다.
- **회원 탈퇴**: 계정 설정 작업에서 만든다. 게시글은 `user_id` cascade 로 지워진다.

## 8. 코드 구성

| 위치 | 내용 |
|---|---|
| `lib/db/schema/post.ts` | `post` 테이블, `POST_VISIBILITIES` |
| `lib/posts/post-id.ts` | `createPostId` |
| `lib/posts/post-path.ts` | `createPostSlug`, `parsePostPath`, `getPostPath` |
| `lib/posts/post-content.ts` | `checkPublishable`, `sanitizePostContent`, `extractPostExcerpt` |
| `lib/posts/queries.ts` | 피드 커서 조회, 상세 조회, 초안별 게시글 조회, 삭제 확인용 개수 조회 |
| `lib/actions/posts.ts` | `publishDraft`, `unpublishDraft`, 피드 다음 묶음 불러오기 |
| `components/posts/` | 피드 목록·카드, 본문 렌더러(`post-content.tsx`) |
| `components/studio/` | 게시 확인 창, 게시 버튼·메뉴 상태, 초안 삭제 확인 창 |
| `app/[lang]/posts/page.tsx`, `app/[lang]/posts/[postPath]/page.tsx` | 피드, 상세 |
| `app/sitemap.ts` | 사이트맵 |

새 문구는 Lingui 로 추가하고 `i18n:extract`, `i18n:compile` 로 카탈로그를 갱신한다.

## 9. 테스트

규칙은 `lib/posts/` 순수 함수로 두고 Vitest 단위 테스트로 확인한다.

| 대상 | 확인할 것 |
|---|---|
| `createPostId` | 길이 10, 영문 대소문자·숫자만 |
| `createPostSlug` | 한글 유지, 기호 → `-`, 연속 `-` 정리, 60자 자르기, 쓸 글자가 없으면 빈 값 |
| `parsePostPath` | 마지막 `-` 뒤 ID, ID 만 있는 주소, 잘못된 주소 |
| `checkPublishable` | 빈칸 개수, 제목 없음, 통과 |
| `sanitizePostContent` | `javascript:` 링크 제거, 스키마 밖 노드·속성 제거, 정상 문서는 유지 |
| `extractPostExcerpt` | 첫 문단 글자, 160자 자르기, 문단 없음 |
| 본문 렌더러 | 제목, 코드 블록, 링크가 든 문서의 렌더링 결과 |

서버 액션과 페이지는 사용자가 로컬 DB 에 마이그레이션을 적용한 뒤 브라우저로 확인한다.

- 게시 → 피드와 상세 표시
- 자동 저장 후 '임시' 표시 → 다시 게시 → 상세 반영, 피드 순서 유지
- 일부 공개 글이 피드·사이트맵에 없고 `noindex` 인지
- 게시 취소 후 상세 404
- 예전 slug 로 들어오면 새 주소로 이동
- 초안 삭제, 저장소 연결 해제 확인 창의 개수

## 10. 범위 밖

- 외부 블로그 연동
- 피드 검색, 태그, 작성자별 목록
- OG 이미지, 메인 헤더의 피드 링크 (디자인 수령 후)
- 게시 이력·버전 되돌리기
- 계정 설정, 저장소 설정 화면 (별도 작업)
