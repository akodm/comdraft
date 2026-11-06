'use server';

import { and, count, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { githubRepository, userRepository } from '@/lib/db/schema';
import { connectUserRepository } from '@/lib/github/repository-connection';
import { localizedRedirect, revalidateLocalizedPath } from '@/lib/i18n/request';
import { parseGithubId } from '@/utils';

// 설치된 저장소 중 하나를 기본 브랜치 기준으로 대시보드 추적 대상에 등록
export async function connectRepository(formData: FormData) {
  const { user } = await requireSession();
  const installationId = parseGithubId(formData.get('installationId'));
  const githubRepoId = parseGithubId(formData.get('githubRepoId'));

  if (!installationId || !githubRepoId) {
    return localizedRedirect(
      '/dashboard/repositories?status=invalid_repository',
    );
  }

  const result = await connectUserRepository({
    userId: user.id,
    requestHeaders: await headers(),
    installationId,
    githubRepoId,
  });

  if (result.status !== 'connected') {
    return localizedRedirect(`/dashboard/repositories?status=${result.status}`);
  }

  await localizedRedirect(`/dashboard/repositories/${result.repositoryId}`);
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
