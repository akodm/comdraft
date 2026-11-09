import 'server-only';
import type { OnboardingRepositoryOption } from '@/components/onboarding/repository-select';
import { connectUserRepository } from '@/lib/github/repository-connection';
import {
  getGithubUserToken,
  GithubApiError,
  GithubUserTokenError,
  listUserInstallationRepositories,
  listUserRepositoryBranches,
} from '@/lib/github/user-api';
import type { InstallationWithRepositories } from '@/lib/github/user-installations';
import { parseGithubId } from '@/utils';

/**
 * 저장소 + 브랜치 선택 화면(온보딩 2단계, 대시보드 저장소 추가)의 공통 서버 로직
 * - 세션 확인과 이동(재로그인, 성공 후 이동)은 화면마다 달라 각 Server Action 에서 처리
 */

// git 참조 이름 최대 길이
const MAX_BRANCH_LENGTH = 255;

export type RepositoryBranchesResult =
  | { status: 'ok'; branches: string[]; defaultBranch: string }
  | { status: 'invalid_repository' | 'error' };

export interface ConnectRepositoryResult {
  status: 'connected' | 'invalid_repository' | 'invalid_branch';
}

// GitHub 토큰이 만료되어 다시 로그인해야 하는 경우 (호출한 Server Action 이 재로그인 화면으로 이동)
interface GithubReauthResult {
  status: 'github_reauth';
}

// 정지되지 않은 설치의 저장소를 선택 드롭다운 항목으로 (이름순)
export const toRepositoryOptions = (
  installations: InstallationWithRepositories[],
): OnboardingRepositoryOption[] => {
  return installations
    .filter(({ installation }) => !installation.suspended_at)
    .flatMap(({ installation, repositories }) =>
      repositories.map((repository) => ({
        value: `${installation.id}:${repository.id}`,
        installationId: installation.id,
        githubRepoId: repository.id,
        fullName: repository.full_name,
      })),
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
};

/**
 * 선택한 저장소의 브랜치 목록 (브랜치 선택 드롭다운용)
 * - 사용자 토큰으로 설치에 포함된 저장소인지 확인한 뒤 조회 (클라이언트가 보낸 id 는 위조 가능)
 * - 기본 브랜치를 맨 앞에 두고 나머지는 GitHub 응답 순서(이름순) 유지
 */
export const listSelectableRepositoryBranches = async ({
  userId,
  requestHeaders,
  installationId,
  githubRepoId,
}: {
  userId: string;
  requestHeaders: Headers;
  installationId: number;
  githubRepoId: number;
}): Promise<RepositoryBranchesResult | GithubReauthResult> => {
  const parsedInstallationId = parseGithubId(String(installationId));
  const parsedGithubRepoId = parseGithubId(String(githubRepoId));

  if (!parsedInstallationId || !parsedGithubRepoId) {
    return { status: 'invalid_repository' };
  }

  try {
    const token = await getGithubUserToken(userId, requestHeaders);
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
      return { status: 'github_reauth' };
    }

    // 404: 설치/저장소 접근 권한 없음, 그 외(403 rate limit, 5xx)는 일시적 오류
    if (error instanceof GithubApiError) {
      return {
        status: error.status === 404 ? 'invalid_repository' : 'error',
      };
    }

    throw error;
  }
};

/**
 * 선택 화면에서 제출한 저장소의 브랜치를 추적 대상으로 등록
 * - 폼 값(installationId, githubRepoId, branch) 검증 후 등록
 */
export const connectSelectedRepository = async ({
  userId,
  requestHeaders,
  formData,
}: {
  userId: string;
  requestHeaders: Headers;
  formData: FormData;
}): Promise<ConnectRepositoryResult | GithubReauthResult> => {
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
    userId,
    requestHeaders,
    installationId,
    githubRepoId,
    branch,
  });

  return { status: result.status };
};
