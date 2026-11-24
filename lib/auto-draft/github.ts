import 'server-only';
import type { BranchCommit, CompareResult } from '@/lib/auto-draft/batch';
import { compareStatusToResult } from '@/lib/auto-draft/batch';
import {
  toBranchCommit,
  walkBackToBase,
  WALK_PER_PAGE,
  type GithubCommitJson,
} from '@/lib/auto-draft/commit-walk';
import { getInstallationOctokit } from '@/lib/github/app';

/**
 * 자동 초안용 GitHub 조회 (설치 토큰 사용, 사용자 토큰 불필요)
 * - 커밋 내용은 판정에만 쓰고 저장하지 않음
 */

export interface AutoDraftRepo {
  installationId: number;
  owner: string;
  name: string;
  branch: string;
}

// 빈 파일 확인을 동시에 몇 개까지 보낼지
const EMPTY_CHECK_CONCURRENCY = 4;

const getErrorStatus = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return Number(error.status);
  }

  return null;
};

// 404 만 null 로 바꾸고 나머지 오류는 그대로 던짐
const nullOnNotFound = async <T>(request: Promise<T>): Promise<T | null> => {
  try {
    return await request;
  } catch (error) {
    if (getErrorStatus(error) === 404) return null;

    throw error;
  }
};

// compare 응답이 250개를 넘어 잘렸을 때 커밋 목록 API 로 base 까지 거슬러 올라가 채움
const listCommitsSince = async (
  repo: AutoDraftRepo,
  baseSha: string,
  headSha: string,
): Promise<BranchCommit[] | null> => {
  const octokit = await getInstallationOctokit(repo.installationId);

  return walkBackToBase(baseSha, async (page) => {
    const response = await octokit.request(
      'GET /repos/{owner}/{repo}/commits',
      {
        owner: repo.owner,
        repo: repo.name,
        sha: headSha,
        per_page: WALK_PER_PAGE,
        page,
      },
    );

    return (response.data as GithubCommitJson[]).map(toBranchCommit);
  });
};

// base(제외) 에서 head 까지의 커밋 (오래된 순), base 가 사라졌거나 조상이 아니면 anchor_missing
export async function compareBranch(
  repo: AutoDraftRepo,
  baseSha: string,
  headSha: string,
): Promise<CompareResult> {
  const octokit = await getInstallationOctokit(repo.installationId);
  const response = await nullOnNotFound(
    octokit.request('GET /repos/{owner}/{repo}/compare/{basehead}', {
      owner: repo.owner,
      repo: repo.name,
      basehead: `${baseSha}...${headSha}`,
    }),
  );

  if (compareStatusToResult(response?.data.status ?? null) !== 'ok') {
    return { status: 'anchor_missing' };
  }

  const { commits, total_commits: totalCommits } = response!.data;

  if (totalCommits > commits.length) {
    const walked = await listCommitsSince(repo, baseSha, headSha);

    return walked
      ? { status: 'ok', commits: walked }
      : { status: 'anchor_missing' };
  }

  return {
    status: 'ok',
    commits: (commits as GithubCommitJson[]).map(toBranchCommit),
  };
}

// 커밋 상세의 변경 파일이 없으면 빈 커밋
const isEmptyCommit = async (repo: AutoDraftRepo, sha: string) => {
  const octokit = await getInstallationOctokit(repo.installationId);
  const response = await octokit.request(
    'GET /repos/{owner}/{repo}/commits/{ref}',
    { owner: repo.owner, repo: repo.name, ref: sha },
  );

  return (response.data.files ?? []).length === 0;
};

// 빈 커밋(변경 파일 없음)의 SHA 집합, 호출부는 트리거 커밋만 넘김
export async function findEmptyCommits(
  repo: AutoDraftRepo,
  shas: string[],
): Promise<Set<string>> {
  const empty = new Set<string>();

  for (let i = 0; i < shas.length; i += EMPTY_CHECK_CONCURRENCY) {
    const chunk = shas.slice(i, i + EMPTY_CHECK_CONCURRENCY);
    const results = await Promise.all(
      chunk.map((sha) => isEmptyCommit(repo, sha)),
    );

    chunk.forEach((sha, index) => {
      if (results[index]) empty.add(sha);
    });
  }

  return empty;
}

// 추적 브랜치의 최신 커밋 SHA (브랜치가 없으면 null)
export async function getBranchHead(
  repo: AutoDraftRepo,
): Promise<string | null> {
  const octokit = await getInstallationOctokit(repo.installationId);
  const response = await nullOnNotFound(
    octokit.request('GET /repos/{owner}/{repo}/branches/{branch}', {
      owner: repo.owner,
      repo: repo.name,
      branch: repo.branch,
    }),
  );

  return response?.data.commit.sha ?? null;
}

// 커밋의 첫 번째 부모 SHA (루트 커밋이거나 커밋이 없으면 null)
export async function getFirstParent(
  repo: AutoDraftRepo,
  sha: string,
): Promise<string | null> {
  const octokit = await getInstallationOctokit(repo.installationId);
  const response = await nullOnNotFound(
    octokit.request('GET /repos/{owner}/{repo}/commits/{ref}', {
      owner: repo.owner,
      repo: repo.name,
      ref: sha,
    }),
  );

  return response?.data.parents[0]?.sha ?? null;
}
