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

// 커밋 목록 API 한 번에 가져오는 개수와 최대 페이지 수
export const WALK_PER_PAGE = 100;
export const WALK_MAX_PAGES = 20;

/**
 * 최신 커밋부터 페이지 단위로 거슬러 올라가 baseSha 직전까지 모음 (오래된 순으로 반환)
 * - baseSha 는 포함하지 않음, 끝까지 가도 baseSha 를 못 만나면 null
 * - fetchPage 는 1부터 시작하는 페이지를 최신순으로 돌려주며, 빈 배열이면 끝
 */
export async function walkBackToBase(
  baseSha: string,
  fetchPage: (page: number) => Promise<BranchCommit[]>,
  maxPages: number = WALK_MAX_PAGES,
): Promise<BranchCommit[] | null> {
  const collected: BranchCommit[] = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const commits = await fetchPage(page);

    if (commits.length === 0) return null;

    for (const commit of commits) {
      if (commit.sha === baseSha) return collected.reverse();
      collected.push(commit);
    }
  }

  return null;
}
