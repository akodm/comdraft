import 'server-only';
import { APIError } from 'better-auth/api';
import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { account } from '@/lib/db/schema';

/**
 * 로그인한 사용자의 GitHub 사용자 토큰(user-to-server)으로 호출하는 API
 * - "이 사용자가 실제로 접근 가능한 설치/저장소인지" 검증, 사용자 본인 권한 기준의 커밋 조회에 사용
 * - GitHub App 의 사용자 토큰은 앱 권한과 사용자 권한의 교집합만 접근 가능
 */

const GITHUB_API_URL = 'https://api.github.com';
const PER_PAGE = 100;
// 브랜치 목록 최대 조회 페이지 (PER_PAGE * 10 = 1000개)
const MAX_BRANCH_PAGES = 10;

export interface GithubAccount {
  id: number;
  login: string;
  type: string;
  avatar_url: string;
}

export interface GithubUserInstallation {
  id: number;
  app_id: number;
  account: GithubAccount | null;
  repository_selection: 'all' | 'selected';
  suspended_at: string | null;
  html_url: string;
}

export interface GithubUserRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  default_branch: string;
  html_url: string;
  owner: { login: string };
  // 라이선스를 감지하지 못했으면 null, 목록에 없는 라이선스는 spdx_id 가 'NOASSERTION'
  license: { key: string; name: string; spdx_id: string | null } | null;
}

export class GithubUserTokenError extends Error {}

export class GithubApiError extends Error {
  status: number;

  constructor(status: number, path: string) {
    super(`GitHub API 요청 실패 (${status}): ${path}`);
    this.status = status;
  }
}

// Better Auth 가 저장한 GitHub 토큰을 복호화해서 가져옴 (만료 시 refresh token 으로 자동 갱신)
export const getGithubUserToken = async (userId: string, headers: Headers) => {
  const [githubAccount] = await db
    .select({ id: account.id })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, 'github')))
    .limit(1);

  if (!githubAccount) {
    throw new GithubUserTokenError('연결된 GitHub 계정이 없습니다.');
  }

  // 토큰 갱신 실패(APIError)도 호출부의 재로그인 안내로 이어지도록 변환
  const { accessToken } = await auth.api
    .getAccessToken({
      body: { accountId: githubAccount.id, userId },
      headers,
    })
    .catch((error: unknown) => {
      if (error instanceof APIError) {
        throw new GithubUserTokenError(
          'GitHub 토큰을 갱신하지 못했습니다. 다시 로그인해주세요.',
        );
      }

      throw error;
    });

  if (!accessToken) {
    throw new GithubUserTokenError(
      'GitHub 토큰이 만료되었습니다. 다시 로그인해주세요.',
    );
  }

  return accessToken;
};

// 상태 코드 확인까지 마친 응답 (본문 외에 Link 헤더 등이 필요할 때 직접 사용)
const githubUserResponse = async (token: string, path: string) => {
  const response = await fetch(`${GITHUB_API_URL}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    cache: 'no-store',
  });

  if (response.status === 401) {
    throw new GithubUserTokenError(
      'GitHub 인증이 만료되었습니다. 다시 로그인해주세요.',
    );
  }

  if (!response.ok) {
    throw new GithubApiError(response.status, path);
  }

  return response;
};

const githubUserFetch = async <T>(token: string, path: string) => {
  const response = await githubUserResponse(token, path);

  return (await response.json()) as T;
};

// 로그인한 GitHub 사용자의 공개 프로필 (계정 설정 화면 표시용)
export interface GithubAuthenticatedUser {
  login: string;
  name: string | null;
  avatar_url: string;
  html_url: string;
}

export const getAuthenticatedGithubUser = (token: string) =>
  githubUserFetch<GithubAuthenticatedUser>(token, '/user');

// 현재 GitHub App 의 설치 중 사용자가 접근 가능한 목록
export const listUserInstallations = async (token: string) => {
  const installations: GithubUserInstallation[] = [];

  for (let page = 1; ; page++) {
    const data = await githubUserFetch<{
      total_count: number;
      installations: GithubUserInstallation[];
    }>(token, `/user/installations?per_page=${PER_PAGE}&page=${page}`);

    installations.push(...data.installations);

    if (
      data.installations.length < PER_PAGE ||
      installations.length >= data.total_count
    ) {
      break;
    }
  }

  return installations;
};

// 특정 설치에서 사용자가 접근 가능한 저장소 목록 (설치에 포함되지 않았거나 사용자 권한이 없으면 404)
export const listUserInstallationRepositories = async (
  token: string,
  installationId: number,
) => {
  const repositories: GithubUserRepository[] = [];

  for (let page = 1; ; page++) {
    const data = await githubUserFetch<{
      total_count: number;
      repositories: GithubUserRepository[];
    }>(
      token,
      `/user/installations/${installationId}/repositories?per_page=${PER_PAGE}&page=${page}`,
    );

    repositories.push(...data.repositories);

    if (
      data.repositories.length < PER_PAGE ||
      repositories.length >= data.total_count
    ) {
      break;
    }
  }

  return repositories;
};

// 사용자가 접근 가능한 설치인지 GitHub 기준으로 확인 (쿼리스트링의 installation_id 는 위조 가능)
export const findUserInstallation = async (
  token: string,
  installationId: number,
) => {
  const installations = await listUserInstallations(token);

  return installations.find(({ id }) => id === installationId) ?? null;
};

export interface GithubUserCommit {
  sha: string;
  html_url: string;
  commit: {
    message: string;
    author: { name?: string; date?: string } | null;
    committer: { date?: string } | null;
  };
  // GitHub 계정과 연결되지 않은 커밋(이메일 미등록 등)은 null
  author: { login: string; avatar_url: string } | null;
}

// Link 헤더에 rel="next" 가 있으면 다음 페이지 존재 (커밋 목록 API 는 전체 개수를 주지 않음)
const hasNextPage = (linkHeader: string | null) => {
  return (
    linkHeader?.split(',').some((link) => /rel="next"/.test(link)) ?? false
  );
};

/**
 * 저장소의 브랜치 이름 목록 (GitHub 응답 순서, 최대 MAX_BRANCH_PAGES 페이지)
 * - 사용자 토큰으로 호출하므로 GitHub 에서 저장소 권한이 없으면 404
 * - 커밋이 하나도 없는 빈 저장소는 빈 배열
 */
export const listUserRepositoryBranches = async (
  token: string,
  { owner, repo }: { owner: string; repo: string },
) => {
  const branches: string[] = [];

  for (let page = 1; page <= MAX_BRANCH_PAGES; page++) {
    const response = await githubUserResponse(
      token,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=${PER_PAGE}&page=${page}`,
    );
    const data = (await response.json()) as Array<{ name: string }>;

    branches.push(...data.map(({ name }) => name));

    if (!hasNextPage(response.headers.get('link'))) {
      break;
    }
  }

  return branches;
};

/**
 * 브랜치의 커밋 목록 한 페이지 (최신순)
 * - 사용자 토큰으로 호출하므로 GitHub 에서 저장소 권한이 해제되면 404
 * - 목록 API 는 메시지/작성자 등 메타데이터만 반환 (변경 파일/diff 미포함)
 */
export const listUserBranchCommits = async (
  token: string,
  {
    owner,
    repo,
    branch,
    page,
    perPage,
  }: {
    owner: string;
    repo: string;
    branch: string;
    page: number;
    perPage: number;
  },
) => {
  const query = new URLSearchParams({
    sha: branch,
    per_page: String(perPage),
    page: String(page),
  });
  const response = await githubUserResponse(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?${query}`,
  );

  return {
    commits: (await response.json()) as GithubUserCommit[],
    hasNextPage: hasNextPage(response.headers.get('link')),
  };
};

export interface GithubUserCommitDetail {
  sha: string;
  html_url: string;
  commit: { message: string };
  // 변경 파일 (최대 300개까지 응답에 포함, 내용(patch)은 사용하지 않음)
  files?: Array<{ filename: string }>;
}

/**
 * 커밋 하나의 상세 (메시지, 변경 파일 목록)
 * - 사용자 토큰으로 호출하므로 GitHub 에서 저장소 권한이 없으면 404
 */
export const getUserCommit = async (
  token: string,
  { owner, repo, sha }: { owner: string; repo: string; sha: string },
) => {
  return githubUserFetch<GithubUserCommitDetail>(
    token,
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${encodeURIComponent(sha)}`,
  );
};
