'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { requireOnboardingSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import { connectUserRepository } from '@/lib/github/repository-connection';
import {
  getGithubUserToken,
  GithubApiError,
  GithubUserTokenError,
  listUserInstallationRepositories,
  listUserRepositoryBranches,
} from '@/lib/github/user-api';
import { localizedRedirect } from '@/lib/i18n/request';
import { parseGithubId } from '@/utils';

// git 참조 이름 최대 길이
const MAX_BRANCH_LENGTH = 255;

export interface ConnectOnboardingRepositoryResult {
  status: 'connected' | 'invalid_repository' | 'invalid_branch';
}

export type OnboardingRepositoryBranchesResult =
  | { status: 'ok'; branches: string[]; defaultBranch: string }
  | { status: 'invalid_repository' | 'error' };

// 온보딩 완료 처리 후 대시보드로 이동
// 약관 동의/추가 입력 등을 받는다면 formData 검증 후 같은 update 에서 함께 저장
export async function completeOnboarding() {
  const { user: sessionUser } = await requireOnboardingSession();

  await db
    .update(user)
    .set({ onboardedAt: new Date() })
    .where(and(eq(user.id, sessionUser.id), isNull(user.onboardedAt)));

  await localizedRedirect('/dashboard');
}

/**
 * 온보딩 2단계: 선택한 저장소의 브랜치 목록 (브랜치 선택 드롭다운용)
 * - 사용자 토큰으로 설치에 포함된 저장소인지 확인한 뒤 조회 (클라이언트가 보낸 id 는 위조 가능)
 * - 기본 브랜치를 맨 앞에 두고 나머지는 GitHub 응답 순서(이름순) 유지
 */
export async function listOnboardingRepositoryBranches(
  installationId: number,
  githubRepoId: number,
): Promise<OnboardingRepositoryBranchesResult> {
  const { user: sessionUser } = await requireOnboardingSession();
  const parsedInstallationId = parseGithubId(String(installationId));
  const parsedGithubRepoId = parseGithubId(String(githubRepoId));

  if (!parsedInstallationId || !parsedGithubRepoId) {
    return { status: 'invalid_repository' };
  }

  try {
    const token = await getGithubUserToken(sessionUser.id, await headers());
    const repositories = await listUserInstallationRepositories(
      token,
      parsedInstallationId,
    );
    const repository = repositories.find(({ id }) => id === parsedGithubRepoId);

    if (!repository) {
      return { status: 'invalid_repository' };
    }

    const branches = await listUserRepositoryBranches(token, {
      owner: repository.owner.login,
      repo: repository.name,
    });
    const defaultBranch = repository.default_branch;

    return {
      status: 'ok',
      defaultBranch,
      branches: branches.includes(defaultBranch)
        ? [defaultBranch, ...branches.filter((name) => name !== defaultBranch)]
        : branches,
    };
  } catch (error) {
    if (error instanceof GithubUserTokenError) {
      return localizedRedirect('/sign-in?error=github_reauth');
    }

    // 404: 설치/저장소 접근 권한 없음, 그 외(403 rate limit, 5xx)는 일시적 오류
    if (error instanceof GithubApiError) {
      return {
        status: error.status === 404 ? 'invalid_repository' : 'error',
      };
    }

    throw error;
  }
}

/**
 * 온보딩 2단계: 선택한 저장소의 브랜치를 추적 대상으로 등록
 * - 온보딩 완료 처리는 화면을 떠날 때(completeOnboarding) 하므로 여기서는 하지 않음
 *   (등록 후 다시 들어오면 온보딩 화면이 3단계부터 표시됨)
 */
export async function connectOnboardingRepository(
  formData: FormData,
): Promise<ConnectOnboardingRepositoryResult> {
  const { user: sessionUser } = await requireOnboardingSession();
  const installationId = parseGithubId(formData.get('installationId'));
  const githubRepoId = parseGithubId(formData.get('githubRepoId'));
  const branch = String(formData.get('branch') ?? '').trim();

  if (!installationId || !githubRepoId) {
    return { status: 'invalid_repository' };
  }

  if (!branch || branch.length > MAX_BRANCH_LENGTH) {
    return { status: 'invalid_branch' };
  }

  const result = await connectUserRepository({
    userId: sessionUser.id,
    requestHeaders: await headers(),
    installationId,
    githubRepoId,
    branch,
  });

  if (result.status === 'github_reauth') {
    return localizedRedirect('/sign-in?error=github_reauth');
  }

  return { status: result.status };
}
