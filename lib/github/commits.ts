import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { githubRepository, userRepository } from '@/lib/db/schema';
import { getInstallationOctokit } from '@/lib/github/app';
import {
  getGithubUserToken,
  listUserBranchCommits,
} from '@/lib/github/user-api';

/**
 * 커밋 조회 (DB 에 저장하지 않고 매번 GitHub API 로 조회)
 * - 보안상 사용자 저장소의 커밋 내역은 서비스 DB 에 보관하지 않음
 * - 초안 작성 화면에서 페이지 단위(기본 30개)로 불러오는 용도
 */

export const COMMITS_PER_PAGE = 30;

// GitHub 목록 API 의 per_page 최대값
const MAX_PER_PAGE = 100;

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

export interface RepositoryCommit {
  sha: string;
  message: string;
  authorName: string | null;
  authorLogin: string | null;
  authorAvatarUrl: string | null;
  committedAt: string | null;
  htmlUrl: string;
}

interface ListRepositoryCommitsParams {
  userId: string;
  requestHeaders: Headers;
  repositoryId: string;
  // 1부터 시작
  page?: number;
  perPage?: number;
}

/**
 * 사용자가 등록한 저장소의 추적 브랜치 커밋 한 페이지 (최신순)
 * - 본인이 등록한 저장소인지 DB 에서 확인 → 등록하지 않은 저장소면 null
 * - 사용자 토큰으로 조회하므로 GitHub 에서 권한이 해제된 저장소는 GithubApiError(404)
 * - 토큰 만료/갱신 실패는 GithubUserTokenError (호출부에서 재로그인 안내)
 */
export const listRepositoryCommits = async ({
  userId,
  requestHeaders,
  repositoryId,
  page = 1,
  perPage = COMMITS_PER_PAGE,
}: ListRepositoryCommitsParams) => {
  const [repository] = await db
    .select({
      ownerLogin: githubRepository.ownerLogin,
      name: githubRepository.name,
      branch: userRepository.branch,
    })
    .from(userRepository)
    .innerJoin(
      githubRepository,
      eq(userRepository.repositoryId, githubRepository.id),
    )
    .where(
      and(
        eq(userRepository.userId, userId),
        eq(userRepository.repositoryId, repositoryId),
      ),
    )
    .limit(1);

  if (!repository) {
    return null;
  }

  const token = await getGithubUserToken(userId, requestHeaders);
  const { commits, hasNextPage } = await listUserBranchCommits(token, {
    owner: repository.ownerLogin,
    repo: repository.name,
    branch: repository.branch,
    page: Math.max(1, Math.floor(page)),
    perPage: Math.min(Math.max(1, Math.floor(perPage)), MAX_PER_PAGE),
  });

  return {
    branch: repository.branch,
    hasNextPage,
    commits: commits.map(
      (item): RepositoryCommit => ({
        sha: item.sha,
        message: item.commit.message,
        authorName: item.commit.author?.name ?? null,
        authorLogin: item.author?.login ?? null,
        authorAvatarUrl: item.author?.avatar_url ?? null,
        committedAt:
          item.commit.committer?.date ?? item.commit.author?.date ?? null,
        htmlUrl: item.html_url,
      }),
    ),
  };
};
