import { App } from '@octokit/app';
import { getGithubAppEnv } from '@/lib/github/env';

/**
 * GitHub App 자체 인증 (앱 private key 로 JWT 서명 → 설치별 액세스 토큰 발급)
 * - 설치 토큰은 1시간 유효하며 @octokit/auth-app 이 내부에서 캐시/재발급
 * - 저장소 데이터(커밋 등) 조회는 사용자 토큰이 아닌 설치 토큰으로 수행
 */
const globalForGithubApp = globalThis as unknown as {
  githubApp?: App;
};

export const getGithubApp = () => {
  if (!globalForGithubApp.githubApp) {
    const { appId, privateKey } = getGithubAppEnv();

    globalForGithubApp.githubApp = new App({ appId, privateKey });
  }

  return globalForGithubApp.githubApp;
};

export const getInstallationOctokit = (installationId: number) => {
  return getGithubApp().getInstallationOctokit(installationId);
};

// GitHub App 설치(저장소 권한 부여) 페이지 URL, state 는 설치 후 SETUP_URL 로 그대로 전달됨
export const getInstallationUrl = (state: string) => {
  const { publicLink } = getGithubAppEnv();
  const url = new URL(`${publicLink}/installations/new`);

  url.searchParams.set('state', state);

  return url.toString();
};
