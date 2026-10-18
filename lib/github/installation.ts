import { db } from '@/lib/db';
import { githubInstallation } from '@/lib/db/schema';
import type { GithubUserInstallation } from '@/lib/github/user-api';

// GitHub 에서 확인한 설치 정보를 저장 (재설치/권한 변경 시 최신 상태로 갱신)
export const upsertInstallation = async (
  installation: GithubUserInstallation,
  userId: string,
) => {
  if (!installation.account) {
    throw new Error('설치 계정 정보를 확인할 수 없습니다.');
  }

  const values = {
    accountId: installation.account.id,
    accountLogin: installation.account.login,
    accountType: installation.account.type,
    accountAvatarUrl: installation.account.avatar_url,
    repositorySelection: installation.repository_selection,
    suspendedAt: installation.suspended_at
      ? new Date(installation.suspended_at)
      : null,
  };

  const [row] = await db
    .insert(githubInstallation)
    .values({
      id: crypto.randomUUID(),
      installationId: installation.id,
      installedByUserId: userId,
      ...values,
    })
    .onConflictDoUpdate({
      target: githubInstallation.installationId,
      set: values,
    })
    .returning({ id: githubInstallation.id });

  return row;
};
