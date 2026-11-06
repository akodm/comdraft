import 'server-only';
import { db } from '@/lib/db';
import { githubRepository, userRepository } from '@/lib/db/schema';
import { upsertInstallation } from '@/lib/github/installation';
import {
  hasRepositoryBranch,
  pruneUntrackedBranchCommits,
  syncRepositoryCommits,
} from '@/lib/github/sync';
import {
  findUserInstallation,
  getGithubUserToken,
  GithubUserTokenError,
  listUserInstallationRepositories,
} from '@/lib/github/user-api';
import { revalidateLocalizedPath } from '@/lib/i18n/request';

interface ConnectUserRepositoryParams {
  userId: string;
  requestHeaders: Headers;
  installationId: number;
  githubRepoId: number;
  // 생략하면 저장소의 기본 브랜치 (존재 여부를 확인하지 않음)
  branch?: string;
}

export type ConnectUserRepositoryResult =
  | { status: 'connected'; repositoryId: string }
  | { status: 'invalid_repository' | 'invalid_branch' | 'github_reauth' };

// 사용자가 GitHub 상에서 해당 설치와 저장소에 실제로 접근 가능한지 확인
const findAccessibleRepository = async (
  token: string,
  installationId: number,
  githubRepoId: number,
) => {
  const installation = await findUserInstallation(token, installationId);

  if (!installation) {
    return null;
  }

  const repositories = await listUserInstallationRepositories(
    token,
    installationId,
  );
  const repository = repositories.find(({ id }) => id === githubRepoId);

  return repository ? { installation, repository } : null;
};

/**
 * 설치된 저장소 중 하나를 사용자의 추적 대상(저장소 + 브랜치)으로 등록하고 커밋 동기화
 * - 이미 등록한 저장소면 추적 브랜치만 바꾸고, 아무도 추적하지 않게 된 브랜치의 커밋은 삭제
 */
export const connectUserRepository = async ({
  userId,
  requestHeaders,
  installationId,
  githubRepoId,
  branch,
}: ConnectUserRepositoryParams): Promise<ConnectUserRepositoryResult> => {
  let verified;

  try {
    const token = await getGithubUserToken(userId, requestHeaders);

    verified = await findAccessibleRepository(
      token,
      installationId,
      githubRepoId,
    );
  } catch (error) {
    if (error instanceof GithubUserTokenError) {
      return { status: 'github_reauth' };
    }

    throw error;
  }

  if (!verified) {
    return { status: 'invalid_repository' };
  }

  const { installation, repository } = verified;
  const trackedBranch = branch ?? repository.default_branch;

  if (
    branch &&
    !(await hasRepositoryBranch(
      installation.id,
      repository.owner.login,
      repository.name,
      branch,
    ))
  ) {
    return { status: 'invalid_branch' };
  }

  const installationRow = await upsertInstallation(installation, userId);

  const metadata = {
    installationId: installationRow.id,
    ownerLogin: repository.owner.login,
    name: repository.name,
    fullName: repository.full_name,
    description: repository.description,
    isPrivate: repository.private,
    defaultBranch: repository.default_branch,
    htmlUrl: repository.html_url,
  };

  const repositoryId = await db.transaction(async (tx) => {
    const [repositoryRow] = await tx
      .insert(githubRepository)
      .values({
        id: crypto.randomUUID(),
        githubRepoId: repository.id,
        ...metadata,
      })
      .onConflictDoUpdate({
        target: githubRepository.githubRepoId,
        set: metadata,
      })
      .returning({ id: githubRepository.id });

    await tx
      .insert(userRepository)
      .values({ userId, repositoryId: repositoryRow.id, branch: trackedBranch })
      .onConflictDoUpdate({
        target: [userRepository.userId, userRepository.repositoryId],
        set: { branch: trackedBranch },
      });

    await pruneUntrackedBranchCommits(tx, repositoryRow.id);

    return repositoryRow.id;
  });

  // 브랜치별로 마지막 커밋 이후만 가져오므로 이미 동기화된 브랜치는 금방 끝남
  await syncRepositoryCommits(repositoryId);

  revalidateLocalizedPath('/dashboard');

  return { status: 'connected', repositoryId };
};
