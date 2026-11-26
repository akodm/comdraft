import 'server-only';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { account } from '@/lib/db/schema';
import { isCollaborationInstallation } from '@/lib/github/installation-ownership';
import {
  getGithubUserToken,
  GithubUserTokenError,
  listUserInstallationRepositories,
  listUserInstallations,
  type GithubUserInstallation,
  type GithubUserRepository,
} from '@/lib/github/user-api';

export interface InstallationWithRepositories {
  installation: GithubUserInstallation;
  repositories: GithubUserRepository[];
  // 다른 사람 개인 계정의 설치 (협업자로 등록된 저장소만 보임)
  isCollaboration: boolean;
}

// 로그인한 사용자의 GitHub 사용자 id (Better Auth 가 GitHub 계정 연결 때 저장)
const getGithubAccountId = async (userId: string) => {
  const [githubAccount] = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'github')))
    .limit(1);

  return githubAccount?.accountId ?? null;
};

// 본인 계정(또는 소속 조직)에 쓸 수 있는 설치가 있는지 (협업 설치만 있으면 앱 설치 안내가 필요)
export const hasOwnInstallation = (
  installations: InstallationWithRepositories[],
) => {
  return installations.some(
    ({ installation, isCollaboration }) =>
      !isCollaboration && !installation.suspended_at,
  );
};

// 사용자 토큰으로 GitHub 에서 직접 조회 → 사용자가 실제 접근 가능한 설치/저장소만 노출
export const loadUserInstallations = async (userId: string) => {
  try {
    const [token, githubAccountId] = await Promise.all([
      getGithubUserToken(userId, await headers()),
      getGithubAccountId(userId),
    ]);
    const installations = await listUserInstallations(token);

    const result: InstallationWithRepositories[] = await Promise.all(
      installations.map(async (installation) => ({
        installation,
        repositories: await listUserInstallationRepositories(
          token,
          installation.id,
        ),
        isCollaboration: isCollaborationInstallation(
          installation.account,
          githubAccountId,
        ),
      })),
    );

    return { installations: result, needsReauth: false };
  } catch (error) {
    if (error instanceof GithubUserTokenError) {
      return { installations: [], needsReauth: true };
    }

    throw error;
  }
};
