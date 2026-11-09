'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { requireOnboardingSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { user } from '@/lib/db/schema';
import {
  connectSelectedRepository,
  listSelectableRepositoryBranches,
  type ConnectRepositoryResult,
  type RepositoryBranchesResult,
} from '@/lib/github/repository-selection';
import { localizedRedirect } from '@/lib/i18n/request';

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

// 온보딩 2단계: 선택한 저장소의 브랜치 목록 (브랜치 선택 드롭다운용)
export async function listOnboardingRepositoryBranches(
  installationId: number,
  githubRepoId: number,
): Promise<RepositoryBranchesResult> {
  const { user: sessionUser } = await requireOnboardingSession();
  const result = await listSelectableRepositoryBranches({
    userId: sessionUser.id,
    requestHeaders: await headers(),
    installationId,
    githubRepoId,
  });

  if (result.status === 'github_reauth') {
    return localizedRedirect('/sign-in?error=github_reauth');
  }

  return result;
}

/**
 * 온보딩 2단계: 선택한 저장소의 브랜치를 추적 대상으로 등록
 * - 온보딩 완료 처리는 화면을 떠날 때(completeOnboarding) 하므로 여기서는 하지 않음
 *   (등록 후 다시 들어오면 온보딩 화면이 3단계부터 표시됨)
 */
export async function connectOnboardingRepository(
  formData: FormData,
): Promise<ConnectRepositoryResult> {
  const { user: sessionUser } = await requireOnboardingSession();
  const result = await connectSelectedRepository({
    userId: sessionUser.id,
    requestHeaders: await headers(),
    formData,
  });

  if (result.status === 'github_reauth') {
    return localizedRedirect('/sign-in?error=github_reauth');
  }

  return result;
}
