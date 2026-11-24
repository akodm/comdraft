# 커밋 트리거 자동 초안 설계

- 작성일: 2026-11-24
- 상태: 구현 완료 (운영 적용 전)
- 대상: comdraft (GitHub App 웹훅, 저장소 설정, 스튜디오 커밋 목록, DB 스키마). comdraft-lambda 는 변경 없음 (커밋 SHA 를 지금처럼 받음)

## 1. 목적

연결한 저장소·브랜치에 커밋을 올리는 동안 대상 커밋이 자동으로 모이고, 커밋 제목을 `[comdraft]` 로 시작하는 커밋을 푸시하면 모인 커밋과 저장소별 프롬프트 프리셋으로 초안 작성을 시작한다. 사용자가 스튜디오에서 커밋을 고르는 수고를 줄이는 것이 목적이다.

## 2. 목표 / 비목표 / 실패 조건

- 목표
  - 저장소 설정에 자동 초안 토글, 프롬프트 프리셋, 기본 옵션 (길이 초기값 `short`)
  - 커밋 제목 `[comdraft] 옵션...` 으로 실행, 옵션은 띄어쓰기로 구분하고 맞지 않는 값은 기본 옵션
  - 대상 커밋은 기준점부터 최대 20개, 넘친 커밋은 다음 묶음으로
  - 실행하지 못한 이유를 저장소 설정의 프롬프트 내역에 실패 사유로 남김
  - 스튜디오 커밋 목록에 기준점·자동 대상·제외됨 표시 (아이콘 + 툴팁), 기준점 변경과 영구 제외
- 비목표
  - 알림 (메일 등). 되묻기(`awaiting_input`)로 멈춘 작업도 사용자가 스튜디오에서 확인
  - CLI
  - PR 머지 커밋(GitHub 이 만든 커밋) 수집
  - 커밋 메시지로 프롬프트, 필수 블록, 모델 지정 (저장소 설정에서만)
  - 사용자 정의 트리거 문구 (`[comdraft]` 고정)
- 실패 조건 (동작해도 실패로 본다)
  - 저장소를 연결한 사용자가 아닌 사람의 푸시로 작업이 만들어지거나 쿼터가 쓰임
  - 같은 트리거 커밋으로 작업이 두 번 만들어짐 (웹훅 재전송 포함)
  - force push, 머지 커밋, GitHub 이 만든 커밋, 제외한 커밋이 자동 대상에 들어감
  - 서명이 맞지 않는 웹훅 요청을 처리함
  - 커밋 메시지·본문이 DB 에 저장됨 (저장하는 것은 SHA 뿐)

## 3. 용어

| 용어 | 뜻 |
| --- | --- |
| 경계 (내부 값) | 마지막으로 처리한 커밋 SHA. 이 커밋 **다음**부터가 대상. 화면에는 보이지 않음 |
| 기준점 (화면) | 경계 다음의 첫 대상 커밋. 커밋 목록에 아이콘으로 표시 |
| 묶음 (자동 대상) | 기준점부터 위(최신 쪽)로 대상 커밋 최대 20개 |
| 제외 커밋 | "없는 셈" 치는 커밋. 사용자가 제외한 것과 force push 로 올라온 것. 되돌리기 전까지 묶음에 들어가지 않고 20개 수에도 넣지 않음 |
| 트리거 커밋 | 제목이 `[comdraft]` 로 시작하는 커밋 |

## 4. 트리거 규칙

- 커밋 **제목 줄**(메시지 첫 줄)이 `[comdraft]` 로 시작하고, 바로 뒤가 줄 끝이거나 공백이어야 한다. `[comdraft]` 는 소문자 그대로만 인정 (Claude 판단: 우연히 걸리는 것을 막기 위해 엄격하게).
- 뒤의 단어를 공백으로 나눠 옵션으로 해석한다. 대소문자는 구분하지 않는다.

| 옵션 | 값 |
| --- | --- |
| 톤 | `plain` `friendly` `professional` |
| 글 종류 | `experience` `lecture` `experiment` |
| 길이 | `short` `medium` `long` |

- 같은 종류가 두 번 나오면 앞의 값을 쓴다 (`short long` → `short`).
- 맞지 않는 단어는 무시하고, 지정하지 않은 종류는 저장소 기본 옵션을 쓴다.
- 필수 블록과 모델은 저장소 기본 옵션만 쓴다.
- 한 번의 푸시에 트리거 커밋이 여러 개면 가장 최신 것 하나로 한 번만 실행한다.
- 트리거 커밋 자체는 파일 변경이 있으면 일반 커밋처럼 대상이 되고, 빈 커밋(`--allow-empty`)이면 대상에서 빠진다.

예:

```
[comdraft]
[comdraft] friendly short
[comdraft] lecture long professional
```

## 5. 대상 커밋 계산

커밋 목록은 DB 에 쌓지 않는다. 저장하는 것은 **경계 SHA 와 제외 SHA 목록**뿐이고, 실행할 때와 스튜디오를 열 때 GitHub 이력에서 계산한다.

```
selectBatch(경계, 끝 커밋):
  경계 다음부터 끝 커밋까지 브랜치 이력을 오래된 순으로 가져옴
  다음은 건너뜀 (20개 수에 넣지 않음)
    - 머지 커밋 (부모 2개 이상)
    - GitHub 이 만든 커밋 (committer 가 web-flow: PR 머지·squash·rebase 버튼, 웹 편집)
    - 제외 목록에 있는 커밋
    - 빈 트리거 커밋
  앞에서부터 20개
```

- 끝 커밋: 자동 실행은 트리거 커밋, 스튜디오 표시는 브랜치 최신 커밋.
- 20개를 넘으면 묶음은 20개에서 멈추고 나머지는 다음 묶음으로 넘어간다.

```
경계 | C1 … C20 | C21 C22 C23 C24 | T([comdraft])
      └ 이번 묶음 ┘└ 다음 묶음 ─────────────┘
실행 후 경계 = C20 → 기준점은 C21, 다음 묶음은 C21~C24 (+ T 가 빈 커밋이 아니면 T)
```

- 경계가 끝 커밋의 조상이 아니면 (force push 로 경계 커밋이 사라짐 등) 계산하지 않는다. 자동 실행은 실패 사유 `anchor_missing`, 스튜디오는 기준점을 다시 지정하라는 안내를 보여 준다.
- 구현 때 확인: GitHub compare API 는 커밋을 최대 250개까지 돌려준다. 범위가 그보다 크면 커밋 목록 API 로 처리한다.

## 6. 웹훅 처리

경로: `app/api/github/webhook/route.ts` (POST)

1. `X-Hub-Signature-256` 을 `GITHUB_WEBHOOK_SECRET` 으로 검증한다. 맞지 않으면 401.
2. `push` 이벤트만 처리하고, 나머지 이벤트는 200 으로 무시한다.
3. `repository.id` 로 `github_repository` 를 찾는다. 그 저장소를 연결했고 자동 초안이 켜져 있으며, 추적 브랜치가 `ref` 와 같은 사용자를 찾는다.
4. 푸시한 사람(`sender.id`)의 GitHub 계정 id 와 그 사용자의 GitHub 계정 id 가 같을 때만 계속한다. 다르면 아무것도 남기지 않는다.
5. `forced: true` 이면 푸시에 들어 있는 커밋을 제외 목록에 넣고(사유 `force_push`) 끝낸다. 트리거가 있어도 실행하지 않는다.
6. 트리거 커밋이 없으면 끝낸다.
7. 응답(202)을 먼저 보내고, 실행은 `after()` 에서 한다 (§7).

중복 방지: 트리거 SHA 를 `draft_prompt.trigger_sha` 에 저장하고 `(user_id, trigger_sha)` 유일 인덱스를 둔다. 재전송된 웹훅은 INSERT 충돌로 끝난다.

## 7. 자동 실행

스튜디오의 `requestDraftGeneration` 과 같은 검사·작업 생성 경로를 쓰고, 입력만 저장소 설정에서 가져온다. 공통 부분은 함수로 분리한다.

1. 프롬프트 프리셋 확인. 없으면 `no_preset`.
2. 사용자 단위 검사 (AI 작성 중지, 사용자 밴, 주간 쿼터, GitHub 토큰).
   - 세션이 없으므로 GitHub 토큰은 `userId` 로만 받는다. 구현 때 better-auth `getAccessToken` 을 요청 헤더 없이 쓸 수 있는지 확인한다. 갱신에 실패하면 `github_reauth`.
3. 프리셋 모델이 지금 등급에서 쓸 수 없으면 `model_locked`.
4. `selectBatch(경계, 트리거 커밋)` 를 계산한다. 비면 `no_commits`, 경계를 찾을 수 없으면 `anchor_missing`.
5. 새 초안과 작업(queued)을 만든다. 시간당 요청 수나 동시 진행 수에 걸리면 `rate_limited` / `too_many_active`.
   - `commitShas` 는 지금처럼 최신순으로 저장한다.
6. 실행기를 시작한다. 시작하지 못하면 지금처럼 작업을 실패 처리한다 (`runner_unavailable`).
7. 실행기를 시작하면 경계를 묶음의 마지막(가장 최신) 커밋으로 옮긴다. 시작 뒤 작성이 실패해도 경계는 돌아가지 않는다. 사용자는 스튜디오에서 기준점을 되돌릴 수 있다.

실패 기록: 4~6 이전에 막히면 초안 없이 `draft_prompt` 행만 남긴다 (`draft_id` null, `status` failed, `error_code`, `repository_id`, `source = 'commit_trigger'`, `trigger_sha`).

- 이 행은 시간당 요청 수에 세지 않는다 (`draft_id is null and source = 'commit_trigger'` 제외).
- 사용량은 0 이라 주간 쿼터에는 영향이 없다.

## 8. 데이터 모델 (마이그레이션 필요, 운영 적용은 사용자가 직접)

`repository_auto_draft` (새 테이블, 사용자·저장소마다 하나)

| 컬럼 | 설명 |
| --- | --- |
| `user_id`, `repository_id` | PK, `user_repository` 에 cascade |
| `enabled` | 자동 초안 토글 |
| `prompt` | 프롬프트 프리셋 (최대 4000자, 비어 있으면 실행 시 `no_preset`) |
| `tone`, `post_type`, `length`, `required_blocks`, `model` | 기본 옵션 (`length` 초기값 `short`) |
| `boundary_sha` | 경계 SHA (null 이면 아직 시작 전) |
| `created_at`, `updated_at` | |

- 토글을 처음 켤 때 경계 = 추적 브랜치의 최신 커밋. 켠 이후 올라온 커밋부터 모인다.
- 추적 브랜치를 바꾸면 경계를 새 브랜치의 최신 커밋으로 다시 잡는다.
- 다시 켤 때(끈 뒤): 경계를 유지한다 (Claude 판단: 꺼 둔 동안의 커밋도 기준점부터 계산되며, 원하지 않으면 스튜디오에서 기준점을 옮긴다).

`repository_excluded_commit` (새 테이블)

| 컬럼 | 설명 |
| --- | --- |
| `user_id`, `repository_id`, `sha` | PK |
| `reason` | `user` (직접 제외) / `force_push` |
| `created_at` | |

`draft_prompt` 에 컬럼 추가

| 컬럼 | 설명 |
| --- | --- |
| `repository_id` | 초안 없는 실패 행을 저장소 프롬프트 내역에 보여 주기 위함 (새 행은 모두 채움) |
| `source` | `studio` (기본) / `commit_trigger` |
| `trigger_sha` | 자동 실행의 트리거 커밋 SHA, `(user_id, trigger_sha)` 유일 |

`error_code` 에 추가하는 값: `no_preset`, `no_commits`, `anchor_missing`. 나머지(`rate_limited`, `too_many_active`, `quota_exhausted`, `quota_unavailable`, `model_locked`, `github_reauth`, `runner_unavailable`, AI 작성 중지·밴)는 기존 상태 값을 실패 코드로 그대로 쓴다.

## 9. 화면

### 9.1 저장소 설정 패널 (`repository-settings-panel`)

새 섹션 "커밋으로 초안 만들기"

- 토글
- 프롬프트 프리셋 입력 (작성 요청 입력창과 같은 길이 제한)
- 기본 옵션 (작성 요청 옵션 UI 재사용, 길이 초기값 `short`)
- 사용법: `[comdraft] friendly short` 예시와 옵션 값 표
- 안내: "PR 머지로 들어온 커밋, 머지 커밋, force push 로 올라온 커밋은 모이지 않습니다"

프롬프트 내역

- 지금은 초안과 조인해서 보여 준다 → `repository_id` 기준으로 바꿔 초안 없는 실패 행도 보이게 한다.
- 자동 실행 행에는 커밋 트리거 아이콘과 트리거 커밋 링크를 붙인다.
- 실패 행에는 사유 문구를 보여 준다.

### 9.2 스튜디오 커밋 목록 (`commit-sidebar`)

체크박스는 지금처럼 **이번 초안에 쓸 커밋**만 정한다. 영구 제외와 기준점 변경은 별도 버튼으로 한다.

| 표시 | 아이콘 (lucide) | 툴팁 |
| --- | --- | --- |
| 기준점 | `flag` | 자동 초안은 이 커밋부터 위로 최대 20개를 사용합니다 |
| 자동 대상 | `layers` | `[comdraft]` 커밋을 올리면 이 커밋이 초안에 포함됩니다 (n/20) |
| 제외됨 (직접) | `circle-slash` | 제외한 커밋입니다. 자동 대상에 들어가지 않습니다 |
| 제외됨 (force push) | `circle-slash` | force push 로 올라와 제외된 커밋입니다 |
| 수집 안 됨 | `git-merge` | 머지 커밋이나 GitHub 에서 만든 커밋은 자동 대상에 들어가지 않습니다 |

- 커밋 줄 동작: "여기를 기준점으로" (`flag`), "제외" / "제외 취소" (`circle-slash` / `undo-2`).
- 기준점을 바꾸면 그 커밋부터 위로 최대 20개가 자동 대상으로 다시 계산된다.
- 제외한 커밋도 체크박스로 직접 골라 초안에 쓰는 것은 가능하다.
- 툴팁은 마우스를 올렸을 때와 키보드 포커스 때 보이고, 아이콘에는 같은 문구의 `aria-label` 을 단다. 터치 기기에서는 탭하면 보인다.
- 자동 초안이 꺼진 저장소에서는 표시와 버튼을 숨긴다.
- 목록 위에 "자동 대상 n/20" 요약을 둔다. 경계를 찾을 수 없으면 "기준점을 다시 지정해 주세요" 안내.

## 10. 외부 설정 (사용자가 직접)

- GitHub App 설정
  - Webhook 활성화
  - URL `https://comdraft.dev/api/github/webhook`
  - Secret 설정
  - Subscribe to events 에서 `Push` 선택
  - 구현 때 확인: 저장소 권한 `Contents: Read` 가 이미 있는지. 없으면 권한이 늘어나 기존 설치 사용자가 승인해야 한다.
- Vercel 환경 변수 `GITHUB_WEBHOOK_SECRET` (Production, 로컬은 `.env.development`)
- 로컬 테스트: `gh webhook forward` 또는 smee 로 로컬 3003 에 전달

## 11. 테스트

- 트리거 파싱: 제목 판정, 옵션 해석, 중복·잘못된 값, 대소문자
- `selectBatch`: 20개 제한, 넘침, 머지·web-flow·제외·빈 트리거 건너뛰기, 경계 없음 (GitHub 응답을 인자로 받는 순수 함수로 작성)
- 웹훅: 서명 검증, 이벤트·브랜치·푸시한 사람 필터, force push 제외 기록, 같은 트리거 재전송
- 실패 기록: 사유별 행 생성, 시간당 요청 수 제외
- 프롬프트 내역: 초안 없는 실패 행 노출

## 12. 구현 때 확인할 것

- better-auth `getAccessToken` 을 세션·헤더 없이 쓸 수 있는지 (§7)
- compare API 250개 제한 (§5)
- `after()` 실행 시간: 실행기 시작까지만 하므로 짧지만 Vercel 함수 제한 안인지 확인
- GitHub App 의 `Contents: Read` 권한 여부 (§10)
