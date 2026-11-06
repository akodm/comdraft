import 'server-only';
import { and, eq, max, notInArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  githubCommit,
  githubInstallation,
  githubRepository,
  userRepository,
} from '@/lib/db/schema';
import { getInstallationOctokit } from '@/lib/github/app';

/**
 * 저장소 커밋 동기화 (설치 토큰 사용)
 * - 사용자들이 추적 중인 브랜치마다 동기화 (같은 브랜치는 한 번만)
 * - 최초 동기화: 브랜치의 최신 커밋부터 최대 MAX_PAGES * PER_PAGE 개
 * - 이후 동기화: 해당 브랜치에 저장된 마지막 커밋 시각 이후만 조회
 * - 같은 sha 는 (repository_id, branch, sha) 유니크 제약으로 브랜치별로 한 번만 저장
 */

const PER_PAGE = 100;
const MAX_PAGES = 10;

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const getErrorStatus = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return Number(error.status);
  }

  return null;
};

// 저장소에 브랜치가 있는지 확인 (커밋이 하나도 없는 빈 저장소는 브랜치도 없음)
export const hasRepositoryBranch = async (
  installationId: number,
  owner: string,
  repo: string,
  branch: string,
) => {
  const octokit = await getInstallationOctokit(installationId);

  try {
    await octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', {
      owner,
      repo,
      branch,
    });

    return true;
  } catch (error) {
    if (getErrorStatus(error) === 404) {
      return false;
    }

    throw error;
  }
};

// 더 이상 아무도 추적하지 않는 브랜치의 커밋 삭제 (저장소 제거, 추적 브랜치 변경 후 호출)
export const pruneUntrackedBranchCommits = async (
  tx: Transaction,
  repositoryId: string,
) => {
  const trackedBranches = tx
    .selectDistinct({ branch: userRepository.branch })
    .from(userRepository)
    .where(eq(userRepository.repositoryId, repositoryId));

  await tx
    .delete(githubCommit)
    .where(
      and(
        eq(githubCommit.repositoryId, repositoryId),
        notInArray(githubCommit.branch, trackedBranches),
      ),
    );
};

export const syncRepositoryCommits = async (repositoryId: string) => {
  const [repository] = await db
    .select({
      id: githubRepository.id,
      githubRepoId: githubRepository.githubRepoId,
      installationId: githubInstallation.installationId,
    })
    .from(githubRepository)
    .innerJoin(
      githubInstallation,
      eq(githubRepository.installationId, githubInstallation.id),
    )
    .where(eq(githubRepository.id, repositoryId))
    .limit(1);

  if (!repository) {
    throw new Error('등록되지 않은 저장소입니다.');
  }

  const trackedBranches = await db
    .selectDistinct({ branch: userRepository.branch })
    .from(userRepository)
    .where(eq(userRepository.repositoryId, repository.id));

  try {
    const octokit = await getInstallationOctokit(repository.installationId);

    // 저장소 이름 변경/소유자 이전에 대비해 id 기준으로 최신 메타데이터 갱신
    const { data: repo } = await octokit.request('GET /repositories/{id}', {
      id: repository.githubRepoId,
    });

    await db
      .update(githubRepository)
      .set({
        ownerLogin: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        description: repo.description,
        isPrivate: repo.private,
        defaultBranch: repo.default_branch,
        htmlUrl: repo.html_url,
      })
      .where(eq(githubRepository.id, repository.id));

    let syncedCount = 0;
    const missingBranches: string[] = [];

    for (const { branch } of trackedBranches) {
      const [{ latestCommittedAt }] = await db
        .select({ latestCommittedAt: max(githubCommit.committedAt) })
        .from(githubCommit)
        .where(
          and(
            eq(githubCommit.repositoryId, repository.id),
            eq(githubCommit.branch, branch),
          ),
        );

      for (let page = 1; page <= MAX_PAGES; page++) {
        let commits;

        try {
          const response = await octokit.request(
            'GET /repos/{owner}/{repo}/commits',
            {
              owner: repo.owner.login,
              repo: repo.name,
              sha: branch,
              since: latestCommittedAt?.toISOString(),
              per_page: PER_PAGE,
              page,
            },
          );

          commits = response.data;
        } catch (error) {
          const status = getErrorStatus(error);

          // 409: 커밋이 하나도 없는 빈 저장소
          if (status === 409) {
            break;
          }

          // 404/422: 등록 후 브랜치가 삭제됨 (저장소 접근 권한은 위의 메타데이터 조회에서 확인됨)
          if (status === 404 || status === 422) {
            missingBranches.push(branch);
            break;
          }

          throw error;
        }

        if (commits.length === 0) {
          break;
        }

        const inserted = await db
          .insert(githubCommit)
          .values(
            commits.map((item) => {
              const authoredAt = item.commit.author?.date;
              const committedAt =
                item.commit.committer?.date ?? authoredAt ?? new Date();

              return {
                id: crypto.randomUUID(),
                repositoryId: repository.id,
                branch,
                sha: item.sha,
                message: item.commit.message,
                authorName: item.commit.author?.name ?? null,
                authorEmail: item.commit.author?.email ?? null,
                authorLogin: item.author?.login ?? null,
                authorAvatarUrl: item.author?.avatar_url ?? null,
                authoredAt: authoredAt ? new Date(authoredAt) : null,
                committedAt: new Date(committedAt),
                htmlUrl: item.html_url,
              };
            }),
          )
          .onConflictDoNothing({
            target: [
              githubCommit.repositoryId,
              githubCommit.branch,
              githubCommit.sha,
            ],
          })
          .returning({ id: githubCommit.id });

        syncedCount += inserted.length;

        if (commits.length < PER_PAGE) {
          break;
        }
      }
    }

    const message =
      missingBranches.length > 0
        ? `추적 중인 브랜치를 찾을 수 없습니다: ${missingBranches.join(', ')}`
        : null;

    await db
      .update(githubRepository)
      .set({ lastSyncedAt: new Date(), lastSyncError: message })
      .where(eq(githubRepository.id, repository.id));

    return message ? { syncedCount, error: message } : { syncedCount };
  } catch (error) {
    const status = getErrorStatus(error);
    let message = '커밋 동기화 중 오류가 발생했습니다.';

    if (status === 404 || status === 401) {
      message =
        'GitHub App 설치가 삭제되었거나 이 저장소에 대한 권한이 해제되었습니다.';
    } else if (status === 403) {
      message =
        'GitHub App 설치가 일시 중지되었거나 API 사용량 한도를 초과했습니다.';
    }

    await db
      .update(githubRepository)
      .set({ lastSyncError: message })
      .where(eq(githubRepository.id, repository.id));

    console.error('[github] commit sync failed', {
      repositoryId: repository.id,
      status,
      error,
    });

    return { syncedCount: 0, error: message };
  }
};
