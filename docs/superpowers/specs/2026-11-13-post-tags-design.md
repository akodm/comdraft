# 게시글 기술 태그와 작성자 GitHub 프로필 연결 설계

## 의도

1. 게시글 상세에서 작성자를 누르면 그 사람의 GitHub 프로필로 갈 수 있게 한다.
2. 글마다 어떤 기술(typescript, react, nextjs, vercel 등)이 쓰였는지 태그로 모아 둔다.
   지금은 어디에도 쓰지 않고 수집만 하며, 나중에 게시글 목록 필터와 SEO 에 쓴다.
   태그는 AI 작성 과정에서 AI 가 스스로 고르고, 사용자는 편집기 맨 아래에서 바꿀 수 있다.

## 목표

- 상세 화면의 작성자(아바타·이름)가 `https://github.com/{login}` 새 탭 링크
- 초안·게시글에 태그 목록 저장, 게시하면 초안 태그가 게시글로 복사
- AI 초안 작성 작업이 태그를 함께 만들어, 결과를 초안에 반영할 때 태그도 반영
- 편집기 본문 아래 가벼운 태그 입력: 입력 후 엔터나 추가 버튼으로 추가, 태그를 누르면 삭제

## 하지 않을 것

- 태그 표시(목록·상세), 태그 필터, 태그 페이지, SEO 메타 (나중 작업, 지금은 수집만)
- 태그 테이블 분리(이름 바꾸기·합치기), 자동 완성
- GitHub 아이디가 바뀐(rename) 사용자 추적
- 운영 DB 마이그레이션·Lambda 배포 실행 (사용자가 함)

## 안티 목표

- 태그 단계 때문에 글 작성이 실패하거나 느려지거나 비용이 눈에 띄게 늘면 실패
- AI 가 매 실행마다 표기를 제각각(`Next.js`/`nextjs`/`next`)으로 넣어 나중 필터가 쓸모없어지면 실패

## 접근 방식

| 방식 | 장점 | 단점 |
| --- | --- | --- |
| **A. 초안·게시글에 `text[]` 태그 컬럼 (선택)** | 단순, 필터는 `tags @> '{nextjs}'` + GIN 색인, 인기 태그는 `unnest` 로 집계 | 태그 이름 바꾸기·합치기는 배열을 고쳐야 함 |
| B. 태그 테이블 + 연결 테이블 | 태그 단위 관리(이름·설명·합치기) | 지금 쓰지 않을 구조로 테이블·조인만 늘어남 |

사용자가 A 와 아래 규칙을 승인했다. 나중에 B 로 옮기기는 어렵지 않다.

AI 쪽: 처음에는 "마지막에 Haiku 한 번 더 부르기"를 제안했으나, Lambda 의 **분석 단계는 고른 작업 모델과 상관없이 항상 Haiku** 임을 확인했다(`src/generation/models.ts` `stagePlan`).
그래서 **분석 단계 출력에 태그를 함께 받는다** (Claude 판단). 추가 호출·추가 비용 없이 Haiku 가 코드 변경을 읽는 바로 그 자리에서 고른다. 분석은 기획 뒤·작성 전에 한 번 돌아 실행마다 태그가 나온다.

## 태그 규칙 (사용자 승인)

- 표기: 모두 소문자, 앞뒤 공백 제거, 안쪽 연속 공백은 `-` 하나로 (`React Native` → `react-native`). 그 밖의 글자(`.`, `#`, `+` 등)는 그대로 둔다
- 한 글 최대 10개, 태그 하나 최대 30자(코드 포인트), 빈 값·중복 제거(정규화 뒤 기준, 먼저 나온 것 유지)
- 규칙은 앱의 순수 함수 하나(`normalizeTags`)가 정하고, 저장하는 모든 곳(사용자 입력, AI 결과 반영, 게시 복사)이 이를 거친다
- AI 에는 널리 쓰는 짧은 소문자 표기(`typescript`, `react`, `nextjs`, `vercel`, `postgresql`)로 3~6개를 고르라고 안내. 글에서 실제로 다룬 기술만, 일반 개념어(`refactoring`, `bugfix`)는 넣지 않음
- AI 를 다시 실행해 본문을 새로 쓰면 태그도 그 결과로 **바꾼다** (본문과 같이). 결과에 태그가 없으면(빈 배열) 기존 태그를 지우지 않고 그대로 둔다
- 빈칸 채우기(fill) 작업은 태그를 건드리지 않는다

## 데이터

마이그레이션 하나(앱 저장소, `pnpm db:generate` → 로컬만 `pnpm db:migrate:local`):

- `draft_prompt.tags text[] not null default '{}'` — Lambda 가 결과와 함께 기록하는 AI 태그
- `draft.tags text[] not null default '{}'`
- `post.tags text[] not null default '{}'` + GIN 색인(`post_tags_idx`, 나중 필터용, 공개 글 조건 없이)
- `user.github_login text` (nullable)

## 동작

### 작성자 GitHub 프로필

- 신규 가입: `mapProfileToUser` 가 `githubLogin: profile.login` 도 돌려주고, `user.additionalFields` 에 `githubLogin`(`input: false`)을 등록해 저장
- 기존 사용자: `account(provider_id = 'github').account_id`(GitHub 숫자 ID)로 GitHub API `GET /user/{id}` 를 불러 `login` 을 채우는 일회성 스크립트. 로컬은 Claude 가 실행, 운영은 사용자가 실행 (스크립트는 DB 주소를 실행 환경에서 받음)
- 상세 화면: `getPublishedPost` 가 `author.githubLogin` 도 돌려줌. 값이 있으면 아바타·이름 묶음을 `<a href="https://github.com/{login}" target="_blank" rel="noopener noreferrer">` 로 감싸고, 없으면 지금처럼 링크 없이 표시
  - `login` 은 GitHub 아이디 형식(`^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$`)일 때만 링크로 씀

### AI 태그 (comdraft-lambda)

- `AnalysisSchema` 에 `tags: string[]` 추가, 분석 프롬프트(한국어·영어)에 태그 규칙 안내 추가
- 검증은 느슨하게: 문자열만, 앞뒤 공백 제거, 빈 값 제거, 최대 10개·각 50자로 자름. 태그가 이상해도 분석을 실패시키지 않음 (최종 규칙은 앱이 적용)
- 태그는 분석 결과에서 작성·검토를 거쳐 작업 완료까지 메모리로 전달되고, `jobs.complete(jobId, result, tags)` 가 `draft_prompt.tags` 에 결과와 함께 기록
- 저장된 분석(`StoredAnalysis`, 빈칸 채우기 재료)에는 넣지 않음
- 앱과 Lambda 의 계약 문서(`lib/generation/contract.ts` ↔ `src/contract.ts`)에 `draft_prompt.tags` 기록을 적음

### 결과 반영 (앱)

- `applyCompletedJob` 이 결과 본문을 반영하는 같은 업데이트에서, `draft_prompt.tags` 를 `normalizeTags` 한 값이 비어 있지 않으면 `draft.tags` 를 그 값으로 바꿈
- 편집기는 반영 후 다시 받은 초안 데이터의 태그를 보여 줌

### 편집기 태그 입력

- 위치: 편집기 스크롤 영역 안, 본문(`EditorContent`) 바로 아래 같은 폭의 열. 초안이 있을 때만
- 모양(Claude 판단): 위에 얇은 구분선, 작은 칩들(`#` 없이 태그 글자, 누르면 삭제, `aria-label` "태그 {tag} 삭제"), 그 뒤 한 줄 입력칸(placeholder "태그 입력")과 "추가" 버튼
- 추가: 엔터 또는 추가 버튼. 정규화 결과가 비었거나, 이미 있거나, 10개가 찼으면 추가하지 않고 입력칸 아래에 짧은 안내(10개 초과일 때만 "태그는 10개까지 넣을 수 있습니다")
  - 한글 입력 조합 중 엔터(`isComposing`)는 무시
- 저장: 추가·삭제할 때마다 서버 액션 `saveDraftTags(repositoryId, draftId, tags)` 로 바로 저장 (본문 자동 저장과 별개). 서버에서 소유 확인 후 `normalizeTags` 한 값을 저장
  - 게시된 초안의 태그가 바뀌면 본문을 고쳤을 때처럼 상태를 '임시'로 (`draftStatusAfterContentChange`)
  - 저장 실패 시 화면의 태그를 저장 전 상태로 되돌리고 짧은 오류 문구
- AI 작성 중(`isLocked`)에는 입력·삭제를 막음 (결과가 태그를 바꾸므로)

### 게시

- `publishDraft` 가 게시글을 만들거나 갱신할 때 `tags: normalizeTags(draft.tags)` 를 함께 저장 (다시 게시 포함)

## 배포 순서 (사용자 실행)

1. 운영 DB 에 마이그레이션 적용
2. 앱 배포 (새 컬럼을 읽으므로 1 다음)
3. 기존 사용자 GitHub 아이디 채우기 스크립트 실행
4. Lambda 배포 (`draft_prompt.tags` 에 쓰므로 1 다음, Terraform plan 확인 후 apply)

2 와 4 는 서로 순서가 없다: 앱만 먼저 나가면 태그가 비어 있을 뿐이고, Lambda 만 먼저 나가도 앱이 아직 태그를 반영하지 않을 뿐이다.

## 테스트

- 앱: `normalizeTags`(대소문자, 공백, 길이, 개수, 중복, 빈 값), GitHub 아이디 형식 검사, 태그 추가 판정(중복·10개·빈 값) 순수 함수 단위 테스트
- Lambda: 태그 검증(느슨한 정리), 파이프라인이 분석 태그를 완료까지 넘기는지(`pipeline.test.ts`, `run-job.test.ts` 기존 방식), 프롬프트 스냅숏이 있으면 갱신
- 화면: 로컬에서 태그 추가·삭제·새로 고침 후 유지, 게시 후 `post.tags`, 상세 작성자 링크. 실제 AI 는 돌리지 않고 `draft_prompt` 에 태그가 있는 완료 작업을 넣어 반영 확인

## 빌더에게 맡기는 것

- 파일 위치·이름, 서버 액션 결과 타입, 칩 스타일 세부(기존 스튜디오 색·크기 토큰 사용)
- Lambda 에서 태그를 완료까지 넘기는 구체 경로(파이프라인 반환 타입 변경 범위)
- GitHub 아이디 채우기 스크립트 형식(`scripts/` 아래 tsx 또는 node 스크립트, 인증 없는 API 호출 60회/시간 제한 안)

## Claude 가 정한 것 (검토 질문에 대한 판단)

- 이미 있는 초안·게시글의 태그는 비어 있는 채로 둔다 (지금 범위에서 AI 로 다시 채우지 않음). 다시 게시하거나 AI 를 다시 실행하거나 직접 넣으면 생김. 옛 글까지 필터에 넣고 싶어지면 별도 작업
- GitHub 아이디 채우기 스크립트는 `github_login` 이 이미 있는 사용자는 건너뛰고, 조회 실패(404, 탈퇴 계정, 호출 제한)는 null 로 두고 넘어가며 결과 개수만 출력. 다시 실행해도 안전 (사용자가 60명을 넘으면 한 시간 뒤 다시 실행)
