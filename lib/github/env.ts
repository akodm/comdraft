const requireEnv = (key: string) => {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} 환경 변수가 설정되지 않았습니다.`);
  }

  return value;
};

export const getGithubAppEnv = () => ({
  appId: requireEnv('GITHUB_APP_ID'),
  // Vercel 등 한 줄로 저장된 키(\n 이스케이프)도 지원
  privateKey: requireEnv('GITHUB_PRIVATE_KEY').replace(/\\n/g, '\n'),
  // 예: https://github.com/apps/comdraft-dev
  publicLink: requireEnv('GITHUB_PUBLIC_LINK').replace(/\/$/, ''),
});
