import 'server-only';
import { headers } from 'next/headers';
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
}

// 사용자 토큰으로 GitHub 에서 직접 조회 → 사용자가 실제 접근 가능한 설치/저장소만 노출
export const loadUserInstallations = async (userId: string) => {
  try {
    const token = await getGithubUserToken(userId, await headers());
    const installations = await listUserInstallations(token);

    const result: InstallationWithRepositories[] = await Promise.all(
      installations.map(async (installation) => ({
        installation,
        repositories: await listUserInstallationRepositories(
          token,
          installation.id,
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
