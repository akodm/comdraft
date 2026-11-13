# comdraft

**GitHub 커밋으로 기술 블로그 초안을 만드는 서비스**

배포: **[comdraft.dev](https://comdraft.dev)** · AI 작성 Lambda: [akodm/comdraft-lambda](https://github.com/akodm/comdraft-lambda)

작업한 커밋을 고르고 "어떤 글을 쓰고 싶은지" 한 줄만 적으면, AI 가 커밋 내용과 코드 변경을 읽고 기술 블로그 초안을 써 줍니다. 초안은 편집기에서 다듬어 그대로 게시하거나 HTML·Markdown 으로 내보낼 수 있습니다.

## 주요 기능

- **GitHub 저장소 연동**: GitHub App 으로 원하는 저장소만 연결하고, 커밋 내역을 스튜디오에서 바로 봅니다.
- **AI 초안 작성**: 커밋(최대 20개)과 요청 문구, 말투·유형·길이·필수 항목 옵션, 참고 링크를 보내면 초안이 만들어집니다.
  - 작성은 `구분 → 분석 → 작성` 세 단계로 진행되고, 진행 상황이 실시간으로 표시됩니다.
  - AI 가 확신하지 못한 부분은 "빈칸"으로 남겨, 직접 채우도록 안내합니다.
  - 화면 언어(한국어·영어)에 맞춰 글을 씁니다.
- **편집기 스튜디오**: Tiptap 기반 편집기에서 제목, 목록, 링크, 코드 블록, 이미지를 편집하고 자동 저장합니다.
  - 이미지는 넣을 때 바로 보이고, 저장할 때 WebP 로 최적화되어 Supabase Storage 에 올라갑니다.
- **게시**: 초안을 전체 공개 또는 일부 공개(주소를 아는 사람만)로 게시합니다. 게시글 피드, 상세 페이지, sitemap 을 제공합니다.
- **사용량 관리**: 사용자 등급별 주간 토큰 할당량(매주 일요일 0시 KST 초기화)과 시간당 요청 수 제한이 있습니다.
- **다국어**: 한국어(기본)와 영어 화면을 제공합니다.

## 어떻게 동작하나요

```text
브라우저 (Next.js 스튜디오)
   │ 작성 요청 (커밋 SHA, 요청 문구, 옵션)
   ▼
Next.js 서버 (Vercel) ── 사용량·권한 검사, 작업 기록 ──▶ Supabase Postgres
   │ SigV4 서명 요청
   ▼
API Gateway ──비동기──▶ AI 작성 Lambda (comdraft-lambda)
                         커밋 조회 → 예상 토큰 검사 → 구분 → 분석 → 작성 (Claude)
                         단계마다 DB 갱신 + Supabase Realtime 신호
   ▲                                          │
   └──────── 진행 신호를 받아 상태 조회 ◀──────┘
```

- 커밋 본문과 코드 변경은 DB 에 저장하지 않고, 필요할 때 GitHub API 로 읽습니다. 작업 기록에는 커밋 SHA, 요청 문구, 옵션, 사용 토큰만 남깁니다.
- 입력은 모두 데이터로 감싸 프롬프트 인젝션을 막고, 게시할 때 본문을 화이트리스트로 다시 정리합니다.

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 웹 | Next.js 16 (App Router, Server Actions), React 19, Tailwind CSS v4 |
| 편집기 | Tiptap 3 (Markdown 변환, 정적 렌더러) |
| 인증 | Better Auth (GitHub OAuth) + GitHub App |
| 데이터 | Supabase Postgres, Drizzle ORM, Supabase Realtime·Storage |
| 이미지 | sharp (WebP 변환) |
| 다국어 | Lingui |
| AI 작성 | AWS API Gateway + Lambda (Terraform), Claude Haiku 5.5 |
| 배포 | Vercel |
| 테스트 | Vitest |

## 폴더 구조

```text
app/            페이지와 라우트 (app/[lang]/... 로 언어별 경로)
components/     화면 컴포넌트 (studio: 편집기 스튜디오, posts: 게시글)
hooks/          클라이언트 훅 (작성 작업 상태, 이미지 대기 목록 등)
lib/            서버·공용 로직 (actions, db/schema, generation, images, posts, studio, auth, i18n)
drizzle/        DB 마이그레이션
locales/        번역 카탈로그 (ko, en)
docs/           설계 문서와 구현 계획
```

## 로컬에서 실행하기

필요한 것: Node.js 22.11 이상, pnpm 11.24 이상, PostgreSQL

```bash
pnpm install
pnpm db:migrate:local   # .env.development 의 DATABASE_MIGRATION_URL 로 마이그레이션
pnpm dev                # http://localhost:3003
```

### 환경 변수

`.env.development`(로컬)와 `.env.production`(운영 마이그레이션용)에 둡니다. 값은 저장소에 올리지 않습니다.

| 변수 | 설명 |
| --- | --- |
| `DATABASE_URL` | 앱이 쓰는 Postgres 주소 |
| `DATABASE_MIGRATION_URL` | 마이그레이션용 Postgres 주소 |
| `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` | Better Auth 설정 |
| `GITHUB_APP_ID`, `GITHUB_APP_NAME`, `GITHUB_PRIVATE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_SECRET_KEY`, `GITHUB_PUBLIC_LINK` | GitHub App 과 OAuth |
| `HOMEPAGE_URL`, `REDIRECT_URL`, `SETUP_URL` | GitHub App 콜백과 서비스 주소 |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase 공개 주소와 키 (Realtime 수신, 이미지 업로드) |
| `SUPABASE_SECRET_KEY` | 서버 전용 Supabase 키 (Storage 업로드·삭제) |
| `GENERATION_RUNNER` | AI 작성 실행기: `fake`(로컬 기본, 고정 결과) 또는 `lambda` |
| `GENERATION_API_URL`, `GENERATION_AWS_REGION`, `GENERATION_AWS_ACCESS_KEY_ID`, `GENERATION_AWS_SECRET_ACCESS_KEY` | `lambda` 실행기일 때 API Gateway 호출 정보 |

로컬에서는 `GENERATION_RUNNER` 를 비워 두면 가짜 실행기가 고정된 초안을 만들어, Lambda 없이 전체 흐름을 확인할 수 있습니다.

### 자주 쓰는 명령

| 명령 | 설명 |
| --- | --- |
| `pnpm dev` | 개발 서버 (3003 포트) |
| `pnpm build` | 번역 컴파일 후 운영 빌드 |
| `pnpm test` | 단위 테스트 (Vitest) |
| `pnpm i18n:extract` / `pnpm i18n:compile` | 번역 문구 추출 / 컴파일 |
| `pnpm db:generate` | 스키마 변경으로 마이그레이션 생성 |
| `pnpm db:migrate:local` / `pnpm db:migrate:prod` | 로컬 / 운영 마이그레이션 적용 |

## 배포

- `main` 브랜치에 push 하면 Vercel 이 배포합니다 (`packageManager` 의 pnpm 버전으로 빌드).
- 스키마가 바뀌면 마이그레이션을 먼저 적용한 뒤 배포합니다.
- AI 작성 Lambda 는 [comdraft-lambda](https://github.com/akodm/comdraft-lambda) 에서 Terraform 으로 따로 배포합니다.

## 관련 문서

설계와 구현 계획은 [`docs/superpowers`](docs/superpowers) 에 있습니다.

- [AI 초안 프롬프트 설계](docs/superpowers/specs/2026-11-10-ai-draft-prompt-design.md)
- [게시 기능 설계](docs/superpowers/specs/2026-11-10-post-publishing-design.md)
- [주간 토큰 할당량 설계](docs/superpowers/specs/2026-11-10-weekly-token-quota-design.md)
- [이미지 업로드 설계](docs/superpowers/specs/2026-11-10-image-upload-design.md)
