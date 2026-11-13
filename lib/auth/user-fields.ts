/**
 * Better Auth user 추가 필드 (lib/auth/index.ts 가 쓰고, 테스트가 Better Auth 의 입력 해석으로 확인)
 * - input: false 인 필드는 클라이언트 요청뿐 아니라 mapProfileToUser 결과에서도 빠짐
 */
export const USER_ADDITIONAL_FIELDS = {
  // 사용량 등급 (quota_plan.role), 클라이언트에서 변경 불가
  role: {
    type: 'string',
    required: false,
    input: false,
  },
  // 세션 user 객체에 포함시키기 위해 등록
  // input: false → 클라이언트(updateUser 등)에서 임의로 설정 불가, 온보딩 서버 액션에서만 기록
  onboardedAt: {
    type: 'date',
    required: false,
    input: false,
  },
  // GitHub 아이디 (게시글 작성자 프로필 링크용)
  // input: true → 가입 때 mapProfileToUser 결과가 저장됨 (false 면 프로필 값도 빠짐)
  // 클라이언트의 사용자 정보 수정 요청으로 바꾸는 것은 user.update.before 훅이 거절 (changesProviderOnlyField)
  githubLogin: {
    type: 'string',
    required: false,
    input: true,
  },
} as const;

// 사용자 정보 수정 요청이 GitHub 프로필에서만 받는 필드를 바꾸려 하는지
export const changesProviderOnlyField = (data: Record<string, unknown>) =>
  'githubLogin' in data;
