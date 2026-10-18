import { and, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { account } from '@/lib/db/schema';

/**
 * 로그인한 사용자의 GitHub 사용자 토큰(user-to-server)으로 호출하는 API
 * - "이 사용자가 실제로 접근 가능한 설치/저장소인지" 검증하는 용도로만 사용
 * - GitHub App 의 사용자 토큰은 앱 권한과 사용자 권한의 교집합만 접근 가능
 */

const GITHUB_API_URL = 'https://api.github.com';
const PER_PAGE = 100;

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
}

export class GithubUserTokenError extends Error {}

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

  const { accessToken } = await auth.api.getAccessToken({
    body: { accountId: githubAccount.id, userId },
    headers,
  });

  if (!accessToken) {
    throw new GithubUserTokenError(
      'GitHub 토큰이 만료되었습니다. 다시 로그인해주세요.',
    );
  }

  return accessToken;
};

const githubUserFetch = async <T>(token: string, path: string) => {
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
    throw new Error(`GitHub API 요청 실패 (${response.status}): ${path}`);
  }

  return (await response.json()) as T;
};

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
