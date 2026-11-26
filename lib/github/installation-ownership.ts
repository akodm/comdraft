import type { GithubAccount } from '@/lib/github/user-api';

/**
 * 다른 사람 개인 계정에 설치된 GitHub App 인지 (협업 저장소로만 접근 가능한 설치)
 * - GitHub 의 /user/installations 는 사용자가 협업자로 등록된 저장소가 있으면 남의 개인 계정 설치도 돌려줌
 * - 조직 설치는 조직 구성원으로 접근하는 것이므로 본인 설치로 봄
 * - githubAccountId 는 Better Auth 가 저장한 GitHub 사용자 id (account.accountId, 문자열)
 */
export const isCollaborationInstallation = (
  account: Pick<GithubAccount, 'id' | 'type'> | null,
  githubAccountId: string | null,
) => {
  if (!account || account.type !== 'User') {
    return false;
  }

  return String(account.id) !== githubAccountId;
};
