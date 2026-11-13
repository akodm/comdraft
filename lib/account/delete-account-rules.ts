// 회원 탈퇴 확인 창에서 탈퇴 버튼을 누를 수 있게 되기까지 기다리는 시간 (실수로 바로 누르지 않도록)
export const DELETE_CONFIRM_DELAY_MS = 2000;

// Better Auth 세션 쿠키 (lib/auth 의 cookiePrefix: comdraft, 운영에서는 __Secure- 접두사가 붙음)
const SESSION_COOKIE_PATTERN =
  /^(__Secure-)?comdraft\.(session_token|session_data|dont_remember)$/;

/** 탈퇴 후 지울 로그인 세션 쿠키인지 (언어·방문자 쿠키는 남김) */
export const isSessionCookieName = (name: string) =>
  SESSION_COOKIE_PATTERN.test(name);

/**
 * GitHub 에서 이 앱에 대한 사용자 권한(grant)을 철회하는 요청
 * - 철회하면 그 사용자의 모든 토큰이 무효가 되고, 다시 가입하면 권한을 새로 묻는다
 * - https://docs.github.com/rest/apps/oauth-applications#delete-an-app-authorization
 */
export const buildGithubGrantRevokeRequest = (
  clientId: string,
  clientSecret: string,
  accessToken: string,
): { url: string; init: RequestInit } => ({
  url: `https://api.github.com/applications/${clientId}/grant`,
  init: {
    method: 'DELETE',
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ access_token: accessToken }),
  },
});
