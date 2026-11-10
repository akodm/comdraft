# 이미지 업로드 설계

- 작성일: 2026-11-10
- 상태: 브레인스토밍 합의 완료, 구현 전
- 대상: comdraft (공통 이미지 업로드 처리 + 초안·게시글 본문 이미지)

## 1. 목적과 범위

글에 이미지를 넣을 수 있게 한다. 업로드한 이미지는 sharp 로 WebP 최적화해 Supabase Storage 에 두고, 본문에는 공개 주소만 저장한다.

- 이번 범위: 모든 이미지가 함께 쓰는 **공통 업로드 처리**(검사, 변환, Storage 업로드, 기록, 정리)와 **초안·게시글 본문 이미지**.
- 다음 범위 (시안이 나오면 같은 처리를 붙임): 게시글 대표 이미지(목록 썸네일, 공유 미리보기), 프로필 이미지.
- 범위 밖: 대체 텍스트 편집, 이미지 크기 조절·정렬, 사용자별 총 용량 제한.

## 2. 핵심 결정 요약

| 주제 | 결정 |
|---|---|
| 업로드 시점 | 편집기에 넣을 때는 `blob:` 주소로만 보여 주고, **자동 저장할 때** 새 이미지만 올린 뒤 공개 주소로 바꿔 저장 |
| 업로드 경로 | 서버가 비공개 임시 버킷의 일회용 업로드 주소를 발급 → 브라우저가 원본을 바로 올림 → 서버가 sharp 변환 후 공개 버킷에 올림. Vercel 함수 요청 본문 한도(4.5MB) 때문에 원본은 서버를 거치지 않음 |
| 인증 | 로그인은 Better Auth 라 Storage RLS 를 쓰지 않음. 서버가 `SUPABASE_SECRET_KEY`(서버 전용, 키 이름 `comdraft_storage`)로 Storage 를 다룸 |
| 받는 형식 | JPEG, PNG, WebP, GIF, AVIF. HEIC 는 "HEIC 형식은 지원하지 않습니다" 로 안내하고 거부 |
| 제한 | 장당 원본 5MB, 초안당 10장. 사용자별 총 용량 제한 없음 |
| 변환 | WebP 품질 80, 가로 최대 1280px (작으면 키우지 않음), 회전 정보 반영 후 메타데이터(EXIF 등) 모두 제거, 움직이는 GIF 는 애니메이션 유지 |
| 버킷 | 환경 구분 없이 한 벌: 공개 `comdraft-images`, 비공개 임시 `comdraft-uploads` |
| 정리 | `image` 기록 테이블. 초안 본문과 게시글 본문 어디에도 없는 그 초안의 이미지만 지움. **기록된 경로만 지우고 버킷을 훑지 않음** (로컬과 운영이 버킷을 같이 쓰므로) |

## 3. 저장소와 데이터

### 3.1 Storage 버킷

- `comdraft-images` (공개): 변환된 WebP. 경로 `{userId}/{imageId}.webp`. `imageId` 는 추측 불가능한 무작위 값(UUID).
- `comdraft-uploads` (비공개): 원본 임시 보관. 경로 `{userId}/{uploadId}`. 버킷 설정으로 파일 크기 5MB, MIME `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `image/avif` 만 허용. 변환이 끝나면 바로 지움.
- 버킷 생성과 설정은 Supabase 관리 도구(SQL `storage.buckets`)로 한다. 마이그레이션에 넣지 않는다 (comdraft 스키마 밖).
- 버킷 이름은 코드 상수로 둔다 (환경 구분이 없으므로).

### 3.2 `image` 테이블 (마이그레이션 0017)

| 컬럼 | 타입 | 내용 |
|---|---|---|
| `id` | text PK | 이미지 id (파일 이름) |
| `user_id` | text not null → `user.id` on delete cascade | 올린 사용자 |
| `draft_id` | text null → `draft.id` on delete set null | 올린 초안. 초안이 지워지면 null 이 되고, 초안 삭제 처리에서 파일과 행을 지움 |
| `path` | text not null unique | 공개 버킷 안의 경로 |
| `width`, `height` | integer not null | 변환 결과 크기 |
| `bytes` | integer not null | 변환 결과 파일 크기 |
| `created_at` | timestamptz(3) not null default now() | 올린 시각 |

- 인덱스: `(draft_id)` (초안별 장 수, 정리), `(user_id, created_at)` (나중의 용량 집계).
- 업로드 대기 상태(일회용 주소 발급 후 변환 전)는 DB 에 두지 않는다. `uploadId` 와 임시 경로는 서버가 만들고, 마무리 요청에서 경로가 그 사용자 것인지 검사한다.

## 4. 편집기와 저장 흐름

### 4.1 이미지 넣기

- 문서 스키마(`lib/studio/editor-schema.ts`)에 `@tiptap/extension-image`(3.33.0) 를 추가한다. 편집기와 서버의 Markdown 변환이 같은 노드를 쓴다. 속성은 `src`, `alt`, `width`, `height` 만.
- 넣는 방법: 툴바 이미지 버튼(lucide `image` 아이콘, 파일 선택), 붙여넣기, 끌어다 놓기.
- 고를 때 브라우저에서 검사한다: 형식(HEIC 안내 포함), 5MB, 초안당 10장(본문의 이미지 수 + 새로 넣는 수). 통과하면 `URL.createObjectURL` 로 `blob:` 주소를 만들어 바로 보여 주고, 파일은 편집기 밖의 대기 목록(`blob:` 주소 → File)에 둔다.
- `alt` 는 파일 이름에서 확장자를 뺀 값으로 넣는다.
- 본문 편집이 가능한 초안(DB 에 초안 행이 있는 경우)에서만 넣을 수 있다. 지금의 편집 가능 조건을 그대로 따른다.

### 4.2 자동 저장할 때

1. 본문에 `blob:` 이미지가 있으면 저장 전에 장마다 올린다.
   1. 서버 액션 `requestImageUpload(draftId)`: 세션, 초안 소유, 편집 잠금, 장 수(그 초안의 `image` 행 수가 10 미만)를 검사하고, `comdraft-uploads` 의 `{userId}/{uploadId}` 일회용 업로드 주소를 발급한다.
   2. 브라우저가 원본을 그 주소로 바로 올린다 (`uploadToSignedUrl`).
   3. 서버 액션 `finalizeImageUpload(draftId, uploadId)`: 임시 원본을 받아 sharp 로 변환하고, `comdraft-images` 에 올리고, `image` 행을 기록하고, 임시 원본을 지운다. 공개 주소와 `width`/`height` 를 돌려준다.
2. 받은 주소로 편집기 안의 `blob:` 주소를 바꾸고, 대기 목록에서 빼고, `URL.revokeObjectURL` 한다.
3. 바뀐 본문으로 기존 `saveDraftContent` 를 부른다. 서버는 저장 후 정리 규칙(6장)을 실행한다.

### 4.3 실패와 이탈

- 업로드가 실패하면 그 이미지는 `blob:` 상태로 두고 "이미지를 올리지 못했습니다. 다시 시도합니다" 를 안내한다. 다음 자동 저장 때 다시 시도한다.
- 그사이 저장되는 본문에서는 `blob:` 이미지를 뺀다 (DB 에 깨진 주소를 두지 않음). 서버 `saveDraftContent` 도 허용 주소(5장)가 아닌 이미지를 지운다.
- 올리지 못한 이미지가 있거나 업로드 중일 때 페이지를 떠나면 브라우저 기본 확인 창(`beforeunload`)으로 막는다.

### 4.4 게시

- 게시 버튼은 지금처럼 게시 직전에 자동 저장을 마무리하므로 이미지 업로드도 끝난 뒤 게시한다.
- 올리지 못한 이미지가 남아 있으면 게시를 막고 안내한다.

## 5. 변환과 보안 검사

### 5.1 sharp 변환 (`lib/images/convert.ts`, 서버 전용)

- `sharp(input, { animated: true, limitInputPixels })` 로 연다. `limitInputPixels` 는 약 4천만 픽셀(예: 8000×5000)로 둬 해상도 폭탄을 막는다.
- 실제 형식(`metadata().format`)이 허용 목록(jpeg, png, webp, gif, avif)이 아니면 거부한다. 확장자나 MIME 만 믿지 않는다. HEIC(`heif`)도 거부한다.
- `.rotate()` 로 회전 정보를 반영하고, `.resize({ width: 1280, withoutEnlargement: true })`, `.webp({ quality: 80 })`. sharp 기본 동작대로 메타데이터는 출력에 남기지 않는다.
- 결과의 `width`, `height`(애니메이션은 한 프레임 높이), `bytes` 를 돌려준다.

### 5.2 이미지 주소 허용 규칙

- 허용: `{NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/comdraft-images/{userId}/{imageId}.webp` 형식, 그리고 `{userId}` 가 그 초안의 사용자.
- 검사 위치: `saveDraftContent`, 게시용 화이트리스트 정리(`sanitizePostContent`), AI 결과 반영(Markdown → 문서 변환 후).
- 이미지 노드는 `src`, `alt`, `width`, `height` 만 남기고, `width`/`height` 는 양의 정수만.
- 그 밖의 이미지(외부 주소, `blob:`, `data:`, 다른 사용자 경로)는 노드째 지운다.

### 5.3 그 밖

- `SUPABASE_SECRET_KEY` 는 `server-only` 모듈(`lib/supabase/server.ts`)에서만 읽는다. `NEXT_PUBLIC_` 을 붙이지 않는다.
- `finalizeImageUpload` 는 `{세션 userId}/{uploadId}` 경로만 읽는다. `uploadId` 는 형식(UUID)을 검사한다.
- 업로드 관련 서버 액션은 초안 소유와 편집 잠금(AI 작성 중)을 기존 `saveDraftContent` 와 같은 조건으로 검사한다.

## 6. 정리 규칙

- 실행 시점: 자동 저장 후, AI 결과 반영 후, 게시 후, 게시 취소 후, 초안 삭제 시.
- 대상: 그 초안의 `image` 행 가운데 경로가 초안 본문에도 게시글 본문(`post.content`)에도 없는 것.
- 올린 지 10분이 지나지 않은 이미지는 정리에서 뺀다. 업로드 직후 본문을 저장하기 전에 다른 저장(다른 탭 등)의 정리가 먼저 돌아 방금 올린 이미지를 지우는 경합을 막는다. 빠진 이미지는 그다음 정리 때 지워진다. 초안 삭제 때는 이 유예 없이 모두 지운다.
- 장 수 제한(10장)은 `image` 행 수로 세므로, 본문에서 지운 이미지도 정리되기 전까지는 수에 들어간다.
- 처리: Storage `comdraft-images` 에서 그 경로들을 지우고 행을 지운다. Storage 삭제가 실패하면 행을 남겨 다음 정리 때 다시 시도한다.
- 초안 삭제: 초안을 지우기 전에 그 초안의 이미지 경로를 모아 두고, 초안(과 게시글) 삭제 후 파일과 행을 지운다.
- 버킷을 훑어 "기록에 없는 파일"을 지우는 처리는 하지 않는다.
- 임시 버킷의 남은 원본(업로드 후 마무리 전에 창을 닫은 경우)은 이번 범위에서 정리하지 않는다. 다음에 `finalize` 가 성공하면 지워지고, 남은 것은 버킷 크기 제한 안에서 무해하다.

## 7. 표시와 내보내기

- 게시글 상세(정적 렌더러)와 편집기 미리보기: `<img src alt width height loading="lazy" decoding="async">`, 최대 폭은 본문 폭. 스타일은 임시 디자인.
- HTML 내보내기는 `<img>`, MD 내보내기는 `![alt](공개 주소)`.
- 게시글 요약(`extractPostExcerpt`)은 이미지를 건너뛴다.

## 8. 코드 구성

| 위치 | 내용 |
|---|---|
| `lib/db/schema/image.ts` | `image` 테이블 |
| `lib/images/rules.ts` | 형식·크기·장 수 상수와 검사, 공개 주소 만들기·허용 검사, 본문에서 이미지 경로 뽑기, 정리 대상 계산, `blob:` 이미지 빼기 (순수 함수) |
| `lib/images/convert.ts` | sharp 변환 (server-only) |
| `lib/supabase/server.ts` | 서버용 Supabase 클라이언트 (server-only, `SUPABASE_SECRET_KEY`) |
| `lib/images/storage.ts` | 업로드 주소 발급, 임시 원본 읽기·삭제, 공개 버킷 올리기·삭제 (server-only) |
| `lib/images/cleanup.ts` | 정리 규칙 실행 (server-only) |
| `lib/actions/images.ts` | `requestImageUpload`, `finalizeImageUpload` |
| `lib/studio/editor-schema.ts` | 이미지 확장 추가 |
| `components/studio/` | 툴바 버튼, 붙여넣기·끌어다 놓기, 대기 목록, 자동 저장 연동, 안내 문구 |
| `lib/posts/post-content.ts`, `lib/actions/studio.ts`, `lib/generation/jobs.ts`, `lib/actions/posts.ts` | 주소 허용 검사와 정리 호출 |
| `components/posts/post-content.tsx` | 이미지 렌더링 |

## 9. 테스트

Vitest:

- `rules`: 형식(HEIC 거부 포함)·5MB·10장 검사, 허용 주소(우리 버킷·사용자 경로 허용, 외부·`blob:`·`data:`·다른 사용자 거부), 본문에서 경로 뽑기, 정리 대상 계산(초안·게시글 어디에도 없는 것만), `blob:` 이미지 빼기.
- `convert`: 작은 실제 이미지로 WebP 출력, 1280px 축소와 작은 이미지 유지, EXIF 제거, 회전 반영, 움직이는 GIF 프레임 유지, 확장자만 바꾼 파일과 HEIC 거부.
- `sanitizePostContent`: 허용 이미지 유지, 그 밖의 이미지 제거, 속성 정리.

로컬 브라우저: 이미지 넣기 → 자동 저장 → 새로고침 후 유지 → 게시글에 표시 → 본문에서 지우면 Storage 와 `image` 행도 사라짐, HEIC·5MB 초과·11번째 이미지 안내.

## 10. 배포

1. 버킷 두 개 생성과 설정 (Supabase 관리 도구, 제가 함).
2. 마이그레이션 0017 을 로컬과 운영에 적용 (`image` 테이블 추가만이라 배포 순서 무관).
3. main push. `SUPABASE_SECRET_KEY` 는 로컬 `.env` 와 Vercel production 에 이미 있음.
