import type { BranchCommit } from '@/lib/auto-draft/batch';

// GitHub 커밋 JSON 중 쓰는 필드만
export interface GithubCommitJson {
  sha: string;
  parents: Array<{ sha: string }>;
  commit: { message: string };
  committer?: { login: string } | null;
}

// GitHub 커밋 JSON 을 판정용 커밋으로 변환 (committer 는 최상위 값, GitHub 계정이 없으면 null)
export function toBranchCommit(json: GithubCommitJson): BranchCommit {
  return {
    sha: json.sha,
    parentShas: json.parents.map((parent) => parent.sha),
    message: json.commit.message,
    committerLogin: json.committer?.login ?? null,
  };
}

// compare 한 페이지에 요청하는 개수와 최대 페이지 수
export const COMPARE_PER_PAGE = 100;
export const COMPARE_MAX_PAGES = 20;

/**
 * compare 결과를 페이지 단위로 이어 붙임 (오래된 순)
 * - 1페이지는 호출부가 이미 받았고, total 만큼 모일 때까지 다음 페이지를 요청
 * - 최대 페이지 안에 다 모으지 못하거나 빈 페이지가 오면 null
 */
export async function collectComparePages(
  first: BranchCommit[],
  total: number,
  fetchPage: (page: number) => Promise<BranchCommit[]>,
  maxPages: number = COMPARE_MAX_PAGES,
): Promise<BranchCommit[] | null> {
  const collected = [...first];

  for (let page = 2; collected.length < total; page += 1) {
    if (page > maxPages) return null;

    const commits = await fetchPage(page);

    if (commits.length === 0) return null;

    collected.push(...commits);
  }

  return collected;
}
