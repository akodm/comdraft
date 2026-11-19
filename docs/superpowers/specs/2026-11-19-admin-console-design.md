# 어드민 콘솔 설계

- 날짜: 2026-11-19
- 저장소: comdraft (어드민 화면, 서버 로직, 마이그레이션), comdraft-lambda (할당량·중지·프롬프트 반영)
- 브랜치: comdraft `feat/admin-console` (`design/hallmark-restyle` 위에서 시작), comdraft-lambda `feat/admin-controls` (`main` 에서 시작)

## 의도

서비스를 혼자 운영하면서 필요한 최소한의 관리 도구를 comdraft 안에 둔다.

- 상태 확인: 사용자, 게시글, AI 사용량, 지금 돌고 있는 AI 작업
- 조치: 사용자·게시글 제재, 사용량과 플랜 조정, 프롬프트 내역 정리
- AI 프롬프트를 배포 없이 어드민에서 고치기
- 봇 공격 같은 상황에서 AI 작성을 한 번에 멈추는 최후의 방어

## 목표

- 공개되지 않은 주소, 서비스 로그인과 분리된 어드민 계정, 단계별 권한
- 통계는 직접 새로고침할 때만 다시 읽음 (자동 갱신·폴링 없음)
- 모든 조치는 누가 언제 무엇을 했는지 기록

## 하지 않는 것

- 어드민 계정 만들기·권한 올리기 화면 (계정과 권한은 운영자가 SQL 로 직접 관리)
- 프롬프트의 `user` 메시지 조립 함수 수정 (코드에 남김)
- 자동 갱신 대시보드, 차트 라이브러리
- 사용자 계정 삭제

## 실패로 보는 것

- 어드민 주소가 서비스 화면, sitemap, robots, 링크 어디에든 드러남
- 평문 비밀번호가 DB, 로그, 쿼리 파라미터 어디에든 남음
- 프롬프트 내역 삭제로 사용자의 이번 주 사용량이 줄어듦
- 어드민에서 고친 프롬프트 때문에 AI 작성이 깨져도 되돌릴 방법이 없음
- guest 권한 계정이 비밀번호 변경 화면 외의 어떤 화면이나 액션에 닿음

## 제약

- Next.js 16 App Router, Tailwind v4, lucide 아이콘, Lingui (ko·en, 기본 ko)
- 마이그레이션은 Claude 가 실행하지 않음. 로컬·운영 모두 운영자가 적용 (운영 마이그레이션 역할은 CREATE 권한이 없어 운영자가 직접 적용)
- 비밀번호 평문 저장·로그 출력 금지, 비밀값은 환경 변수로
- 배포 순서: 마이그레이션 → comdraft → comdraft-lambda
- 요청·신호 형식과 오류 코드는 comdraft `lib/generation/contract.ts` 와 lambda `src/contract.ts` 를 같게 유지

## 접근 방식 (검토한 것과 고른 것)

### 주소

- 검토: `/<키>/admin` 을 루트에 두기 → `app/[lang]` 과 같은 위치의 동적 경로라 충돌하고, proxy 의 로케일 리다이렉트도 거침. proxy rewrite 로 피할 수 있지만 경로가 두 겹이 됨
- 검토: `/[lang]/<키>/admin` → 키 자리가 `posts`·`dashboard` 같은 기존 정적 경로와 같은 위치라 `/ko/posts/admin` 같은 기존 주소와 겹침
- **고름: `/[lang]/admin/<키>`** (운영자 결정). `admin` 은 `app/[lang]` 아래의 새 정적 경로라 기존 주소와 겹치지 않음. 기존 로케일 체계를 그대로 쓰고 Lingui 번역도 적용

### 어드민 인증

- 검토: Better Auth 에 아이디·비밀번호 플러그인 추가 → 서비스 사용자와 세션·쿠키가 섞이고, guest·임시 비밀번호 흐름을 플러그인에 맞춰야 함
- **고름: 어드민 전용 테이블과 쿠키** (`admin_account`, `admin_session`). bcrypt 로 확인·해싱 (Node, `bcryptjs`). 임시 비밀번호는 운영자가 SQL 에서 `pgcrypto` 의 `crypt(..., gen_salt('bf'))` 로 넣으므로 같은 bcrypt 형식으로 확인 가능. 새 비밀번호는 Node 에서 해싱해 평문이 DB 쿼리로 넘어가지 않음

### 프롬프트 수정 범위

- A (고름, 운영자 결정): 단계별 `system` 문장과 옵션 문구만 DB 로. `user` 조립 함수는 코드
- B: `user` 메시지까지 자리표시자 템플릿으로 → 3,600줄 재작성, 자리표시자 오류 하나로 생성이 깨짐

### 프롬프트 기본값 위치

- **X (고름, 운영자 결정): DB 에는 고친 것만, 기본값은 Lambda 코드.** 고치지 않은 항목은 코드 개선이 자동 반영. 어드민이 기본 문장을 보여 줄 수 있도록 Lambda 가 기본값을 `ai_prompt_default` 에 올림
- Y: 모든 문장을 DB 에 한 번 넣고 DB 가 기준 → 단순하지만 코드와 DB 가 어긋남

### 프롬프트 내역 삭제

- **고름 (운영자 결정): 숨김 처리.** `draft_prompt.deleted_at` 만 기록하고 행과 비용은 그대로. 사용자 화면에서만 사라지고 사용량 계산·통계에는 계속 들어감

## 설계

### 1. 주소와 진입

- 경로: `app/[lang]/admin/[adminKey]/...` → `comdraft.dev/ko/admin/<키>`, 하위 화면은 `/ko/admin/<키>/users` 처럼
- 환경 변수 `ADMIN_PATH_KEY`: 영문·숫자·`-`·`_` 만, 16자 이상. 없거나 형식이 틀리면 어드민 전체를 끔
- proxy (`proxy.ts`): 로케일 다음 세그먼트가 `admin` 인 모든 경로(`/{lang}/admin`, `/{lang}/admin/{x}`, `/{lang}/admin/{x}/...`)에서 `x` 가 없거나, 키와 다르거나, 키가 설정되지 않았으면 403 응답. 비교는 길이 차이에도 시간이 일정하게
- 로케일 없이 들어온 `/admin/...` 은 기존처럼 로케일을 붙여 리다이렉트한 뒤 같은 규칙을 거침
- 어드민 경로는 서비스 사용자 세션 리다이렉트(`PROTECTED_PATHS`) 대상이 아님
- 어드민 레이아웃에서도 키를 한 번 더 확인 (proxy 를 우회한 경우 403)
- 모든 어드민 화면 `noindex, nofollow`, sitemap·robots 에 넣지 않음, 서비스 화면에서 링크하지 않음

### 2. 어드민 계정과 권한

권한 순서: `guest` < `viewer` < `editor` < `admin`

| 권한 | 할 수 있는 것 |
| --- | --- |
| guest | 로그인 후 임시 비밀번호 변경 화면만. 비밀번호를 정한 뒤 다시 guest 가 되면 아예 들어올 수 없음 |
| viewer | 모든 조회 (통계, 목록, 상세, 프롬프트 내역, AI 프롬프트, AI 상태) |
| editor | viewer + 사용자 밴·해제, 세션 무효화, 사용량 초기화, 플랜 변경, 게시글 밴·해제, AI 프롬프트 수정·기본값 되돌리기 |
| admin | editor + 게시글 삭제, 프롬프트 내역 삭제, AI 작성 중지·재개 |

- editor 가 AI 프롬프트를 고칠 수 있는 것은 설계에서 정한 것 (운영자가 예로 든 "중대 결정"은 삭제·중지였음)
- 권한은 운영자가 SQL 로만 바꿈. 어드민 화면에는 권한을 바꾸는 기능이 없음
- 권한 검사는 화면(메뉴·버튼 숨김)과 서버 액션 양쪽에서. 서버 액션 검사가 기준

**처음 계정을 만드는 흐름**

1. 운영자가 SQL 로 계정 행을 넣음: 아이디, `temp_password_hash = crypt('<임시값>', gen_salt('bf'))`, 권한은 기본값 `guest`
2. 어드민이 아이디·임시 비밀번호로 로그인 → 비밀번호 변경 화면으로만 이동
3. 새 비밀번호와 확인 입력 → `password_hash` 저장, `temp_password_hash` 비움, 권한이 guest 면 viewer 로
4. 이후 로그인은 `password_hash` 로만

- `temp_password_hash` 가 있으면 로그인은 임시 비밀번호로 확인하고 항상 변경 화면으로 보냄 (운영자가 비밀번호를 다시 발급할 때도 같은 흐름: 임시 해시를 넣고 `password_hash` 를 비움)
- 비밀번호를 정한 뒤 직접 비밀번호를 바꾸는 것도 프로필 메뉴에서 가능 (현재 비밀번호 확인)
- 비밀번호 규칙: 12자 이상, 아이디와 같지 않음
- 로그인 실패 5회면 15분 잠금. 실패 메시지는 아이디·비밀번호 중 무엇이 틀렸는지 구분하지 않음
- 없는 아이디도 더미 bcrypt 비교를 거쳐 응답 시간을 맞춤
- IP 단위 제한: 한 IP 에서 1시간에 로그인 실패 20회를 넘으면 거부 (서버리스라 DB 에 셈. 기존 `rate_limit` 테이블 방식을 따름)

**어드민 세션**

- 쿠키 `comdraft_admin`: HttpOnly, Secure (운영), SameSite=Strict, 경로 `/`
- 쿠키에는 임의 토큰, DB 에는 토큰의 SHA-256 만 저장
- 만료: 로그인 후 12시간 (연장 없음). 로그아웃하면 행 삭제
- 비밀번호를 바꾸면 그 계정의 다른 세션을 모두 지움

### 3. 화면

- 로그인·비밀번호 변경: 화면 중앙에 입력 폼만 (헤더·사이드바 없음)
- 그 외 화면
  - 헤더: 왼쪽 로고, 오른쪽 프로필 버튼
  - 로고는 서비스 인덱스(`/[lang]`)로 이동 (서비스 로그인 세션이 있으면 서비스 쪽에서 대시보드로 감)
  - 프로필 메뉴: 아이디와 권한 표시, 비밀번호 변경, 로그아웃
  - 본문 왼쪽: 사이드 메뉴 (대시보드, 사용자, 게시글, 프롬프트 내역, AI 프롬프트, AI 제어)
  - 본문 오른쪽: 넓게 실제 내용. 목록은 표
  - 푸터 없음
- 목록은 50개씩 페이지 나눔, 검색어는 주소 쿼리로 (새로고침해도 유지)
- 되돌리기 어려운 조치(삭제, 중지, 밴)는 확인 단계를 거침
- Tailwind v4 와 restyle 의 토큰(`--color-brand` 등)을 그대로 씀

### 4. 기능

**대시보드 (통계)**

- 화면을 열 때 한 번 읽고, "새로고침" 버튼을 눌렀을 때만 다시 읽음 (`router.refresh`). 마지막으로 읽은 시각 표시
- 사용자: 전체, 이번 주 새 사용자, 밴 상태, 등급별 수
- 게시글: 전체, 전체 공개·일부 공개, 임시 조치(밴), 이번 주 새 게시글
- AI 사용량: 이번 주 작업 수, 비용 합, 모델별 작업 수와 비용, 실패 수. 기준 주는 기본 등급 정책의 주 경계
- 진행 중인 AI 작업: `draft_prompt.status` 가 `queued`·`running`·`awaiting_input` 인 행. 사용자, 모델, 단계, 시작 시각, 경과 시간. 시간 초과 기준을 넘긴 행은 "멈춤 의심"으로 표시

**사용자**

- 목록: 이메일·GitHub 아이디 검색, 등급, 이번 주 사용량(%), 밴 여부, 가입일
- 상세: 기본 정보, 이번 주 사용량, 최근 작업, 게시글 수
- 밴: `user.banned_at`·`ban_reason` 기록, 그 사용자의 세션 모두 삭제
  - 밴된 사용자는 새 로그인 불가 (Better Auth 세션 생성 단계에서 거부), 기존 페이지 접근 시 로그인 화면으로
  - AI 작성 요청 거부 (작성 요청 공용 검사), Lambda 도 작업 시작 시 거부
  - 이미 단계를 진행 중인 작업은 끝까지 감 (AI 중지와 같은 정책), 아직 시작 전인 작업은 Lambda 가 거부
  - 게시글은 그대로 (필요하면 게시글 밴을 따로)
- 밴 해제
- 세션 무효화: 그 사용자의 세션 행 모두 삭제 (쿠키 캐시가 꺼져 있어 바로 반영)
- 사용량 초기화: `user.quota_reset_at = now()`. 이번 주 사용량은 `max(주 시작, quota_reset_at)` 이후에 만든 작업만 셈 (comdraft·Lambda 양쪽). 작업 기록은 지우지 않음
  - 초기화 전에 만든 작업은 진행 중이던 것까지 모두 새 구간에서 빠짐 (사용자에게 유리한 쪽, 단순함을 택함)
- 플랜 변경: `user.role` 을 `quota_plan` 에 있는 등급 중 하나로. 사용량은 그대로 유지
  - 내려간 등급의 한도를 넘으면 사용률이 100% 를 넘어 표시(예: 123%)되고 남은 양이 0 이하라 요청이 거부됨. 지금의 계산 방식이 이미 그렇게 동작하는지 계획 단계에서 테스트로 확인

**게시글**

- 목록: 제목·작성자 검색, 공개 범위, 언어, 게시일, 조회 수, 밴 여부
- 밴·해제: 기존 검수 API 와 같은 동작 (목록·sitemap 제외, 상세는 안내만) + sitemap 갱신
- 삭제 (admin): 게시글 행 삭제, 원래 초안은 `draft` 상태로 되돌림, sitemap 갱신

**프롬프트 내역**

- 목록: 사용자, 초안, 요청 문구 일부, 모델, 상태, 비용, 만든 시각, 삭제 여부. 삭제된 것도 보이되 표시
- 상세: 요청 문구, 옵션, 커밋 SHA, 참고 링크, 오류 코드, 사용 토큰·비용
- 삭제 (admin): `deleted_at` 기록
  - 진행 중인 작업(`queued`·`running`·`awaiting_input`)은 삭제 불가
  - 사용자 화면의 모든 `draft_prompt` 조회에서 제외 (스튜디오 작업 이력, 마지막 옵션 복원 등)
  - 사용량 계산, 통계, 어드민 목록에는 계속 포함

**AI 프롬프트**

- 대상 키 (로케일 ko·en 각각)
  - `plan.system`, `analyze.system`, `write.system`, `review.system`, `revise.system`, `fill.system`
  - 말투(`tone.*`), 글 유형(`postType.*`), 길이 안내 문구(`length.*.target`), 필수 항목(`requiredBlocks.*`)
  - 규칙 마커, 검토 패턴, `user` 조립 함수, 숫자 설정은 코드에 남김
- 목록: 키별로 "기본값 사용 / 수정됨", 마지막 수정자·시각
- 편집: 기본 문장(읽기 전용)과 수정 문장을 나란히. 저장, 기본값으로 되돌리기(수정 행 삭제)
- 수정 이력: 저장·되돌리기마다 이전 문장을 `ai_prompt_revision` 에 남기고, 이력에서 골라 다시 적용할 수 있음
- 저장 검사: 기본값에 들어 있던 필수 문자열이 빠지면 저장 거부, 빈 문장 거부, 최대 길이 제한
  - 필수 문자열(`required_markers`)은 Lambda 가 키마다 정해 기본값과 함께 올림: 규칙 마커, 그 문장에 코드 상수로 들어간 값(예: `FILL_TARGET_MARKER`), 출력 형식을 정하는 태그 이름
  - 기본 문장에는 코드 상수가 이미 실제 값으로 풀려 들어가 있음 (DB 문장은 템플릿이 아니라 완성된 텍스트)
- 반영: 다음에 시작하는 작업부터 (Lambda 가 작업마다 읽음)

**AI 제어**

- 현재 상태(작성 가능 / 중지됨), 마지막으로 바꾼 사람·시각·사유
- 중지 (admin, 사유 입력): 새 작성·빈칸 채우기·되묻기 재개 요청을 모두 거부, Lambda 도 작업 시작 시 확인해 거부. 이미 단계를 진행 중인 작업은 끝까지 감
  - Lambda 가 시작 전에 거부한 작업은 새 오류 코드로 `failed` 처리. Claude 를 부르기 전이라 `used_cost` 가 0 이므로 지금의 `getJobUsage` 로도 사용량 0 (바꿀 필요 없음, 테스트로 고정)
  - 되묻기 답을 기다리는 작업(`awaiting_input`)은 재개 요청만 거부되고 상태는 그대로. 재개되면 이어서 진행
- 재개 (admin)
- 사용자에게는 "지금은 AI 작성을 잠시 멈췄어요" 안내 (새 오류 코드)

**조치 기록**

- 모든 변경 조치를 `admin_action_log` 에 남김: 어드민, 조치 종류, 대상, 요약(사유, 바꾼 등급 등), 시각
- 어드민 화면에서 조회 (대시보드 하단 최근 기록, 사용자·게시글 상세의 관련 기록)
- 비밀번호, 프롬프트 전문은 기록하지 않음 (프롬프트는 키만)

### 5. 데이터 (comdraft 스키마)

새 테이블

- `admin_account`: `id`, `login_id`(유일), `temp_password_hash`(null 가능), `password_hash`(null 가능), `role`(guest·viewer·editor·admin, 기본 guest), `failed_attempts`, `locked_until`, `password_changed_at`, `last_login_at`, `created_at`, `updated_at`
- `admin_session`: `id`, `admin_id`(→ admin_account, 삭제 시 함께), `token_hash`(유일), `expires_at`, `ip_address`, `user_agent`, `created_at`
- `admin_action_log`: `id`, `admin_id`, `action`, `target_type`, `target_id`, `detail`(jsonb), `created_at`
- `service_setting`: `key`(기본키), `value`(jsonb), `updated_by`, `updated_at`. 첫 키 `ai_generation` = `{ paused, reason }`
- `ai_prompt` (수정본): `locale`, `key`, `content`, `updated_by`, `updated_at`, 기본키 (`locale`, `key`)
- `ai_prompt_revision` (수정 이력): `id`, `locale`, `key`, `content`(null 이면 기본값 상태였음), `admin_id`, `created_at`
- `ai_prompt_default` (Lambda 가 올리는 기본값): `locale`, `key`, `content`, `required_markers`(text[]), `version`, `updated_at`, 기본키 (`locale`, `key`)

바뀌는 열

- `user`: `banned_at`, `ban_reason`, `quota_reset_at`
- `draft_prompt`: `deleted_at`

권한

- 앱이 쓰는 DB 역할: 새 테이블 읽기·쓰기
- Lambda 가 쓰는 DB 역할: `ai_prompt`·`service_setting` 읽기, `ai_prompt_default` 쓰기, `user` 의 새 열 읽기
- 운영 적용 SQL 에 필요한 GRANT 를 함께 적어 운영자에게 넘김. 역할 이름은 기존 `drizzle/` 마이그레이션과 운영 DB 의 현재 권한에서 확인

### 6. comdraft-lambda

- 할당량 계산: 사용량을 셀 때 `created_at >= max(주 시작, user.quota_reset_at)` (지금 `src/jobs.ts` 의 예약 쿼리)
- 작업 시작 검사: `service_setting.ai_generation.paused` 면 실패(새 오류 코드), 작업 주인이 밴 상태면 실패
- 프롬프트
  - 작업마다 그 로케일의 `ai_prompt` 수정본을 한 번 읽어 코드 기본 묶음 위에 덮어씀 (`getPromptPack` 이 수정본을 받음)
  - 덮어쓴 `system` 이 규칙 마커를 잃었으면 그 키는 기본값을 씀 (어드민 저장 검사가 뚫린 경우의 안전장치)
  - 기본값 올리기: 콜드 스타트 때 기본 묶음의 해시를 계산해 `ai_prompt_default.version` 과 다르면 모든 키를 한 트랜잭션으로 갱신. 같으면 아무것도 쓰지 않음
- 오류 코드 추가는 양쪽 `contract.ts` 에 같이

### 7. 사용자 화면 변경 (comdraft)

- 작성 요청 공용 검사(`checkGenerationGate`)에 AI 중지와 사용자 밴 확인 추가
- 사용자 세션 확인(`requireSession`)에서 밴 사용자 거부
- 사용량 계산(`getUserQuota`)에 `quota_reset_at` 반영
- `draft_prompt` 를 읽는 사용자 쪽 조회에서 `deleted_at` 이 있는 행 제외
- 새 오류 코드의 안내 문구 (ko·en)

## 테스트

- 권한 판정 (권한별 허용 조치 표), guest 진입 제한
- 비밀번호: pgcrypto 형식 해시 확인, 변경 후 guest → viewer, 잠금, 세션 정리
- 주소 키 비교 (일치, 불일치, 키 없음, 형식 오류)
- 사용량: 초기화 시점 이후만 셈, 플랜 다운그레이드 시 100% 초과 표시와 거부
- 프롬프트: 수정본 덮어쓰기, 마커 누락 시 거부·대체, 기본값 해시 갱신 조건
- 숨긴 프롬프트 내역이 사용자 조회에서 빠지고 사용량에는 남음
- AI 중지 시 요청 거부 (comdraft 검사, Lambda 시작 검사)

## 빌더에게 맡기는 것

- 화면 세부 배치, 표의 열 순서와 문구
- 통계 쿼리 구성과 인덱스
- 어드민 서버 액션 파일 구성
- 오류 코드 이름 (양쪽 계약에 같게)
