'use server';

import { and, count, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { requireSession } from '@/lib/auth/session';
import {
  getDashboardRepositoryPage,
  type DashboardRepositoryPage,
} from '@/lib/dashboard/queries';
import { db } from '@/lib/db';
import { githubRepository, userRepository } from '@/lib/db/schema';
import {
  connectSelectedRepository,
  listSelectableRepositoryBranches,
  type ConnectRepositoryResult,
  type RepositoryBranchesResult,
} from '@/lib/github/repository-selection';
import { localizedRedirect, revalidateLocalizedPath } from '@/lib/i18n/request';

// 대시보드 무한 스크롤: 커서 다음의 등록 저장소
export async function loadDashboardRepositories(
  cursor: string,
): Promise<DashboardRepositoryPage> {
  const { user } = await requireSession();

  return getDashboardRepositoryPage(user.id, cursor);
}

// 저장소 추가 화면: 선택한 저장소의 브랜치 목록 (브랜치 선택 드롭다운용)
export async function listDashboardRepositoryBranches(
  installationId: number,
  githubRepoId: number,
): Promise<RepositoryBranchesResult> {
  const { user } = await requireSession();
  const result = await listSelectableRepositoryBranches({
    userId: user.id,
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
 * 저장소 추가 화면: 선택한 저장소의 브랜치를 추적 대상으로 등록하고 대시보드로 이동
 * - 온보딩 완료 여부(onboardedAt)는 건드리지 않음
 * - 실패하면 화면에 오류를 표시할 수 있도록 결과를 반환
 */
export async function connectDashboardRepository(
  formData: FormData,
): Promise<ConnectRepositoryResult> {
  const { user } = await requireSession();
  const result = await connectSelectedRepository({
    userId: user.id,
    requestHeaders: await headers(),
    formData,
  });

  if (result.status === 'github_reauth') {
    return localizedRedirect('/sign-in?error=github_reauth');
  }

  if (result.status === 'connected') {
    return localizedRedirect('/dashboard');
  }

  return result;
}

// 대시보드에서 저장소 제거 (다른 사용자가 등록하지 않은 저장소면 저장소 정보까지 삭제)
export async function disconnectRepository(formData: FormData) {
  const { user } = await requireSession();
  const repositoryId = String(formData.get('repositoryId') ?? '');

  await db.transaction(async (tx) => {
    const removed = await tx
      .delete(userRepository)
      .where(
        and(
          eq(userRepository.userId, user.id),
          eq(userRepository.repositoryId, repositoryId),
        ),
      )
      .returning({ repositoryId: userRepository.repositoryId });

    // 본인이 등록하지 않은 저장소는 건드리지 않음
    if (removed.length === 0) {
      return;
    }

    const [{ remaining }] = await tx
      .select({ remaining: count() })
      .from(userRepository)
      .where(eq(userRepository.repositoryId, repositoryId));

    if (remaining === 0) {
      await tx
        .delete(githubRepository)
        .where(eq(githubRepository.id, repositoryId));
    }
  });

  revalidateLocalizedPath('/dashboard');
  await localizedRedirect('/dashboard');
}
