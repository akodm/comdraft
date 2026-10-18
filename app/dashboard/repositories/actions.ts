'use server';

import { and, count, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import {
  githubInstallation,
  githubRepository,
  userRepository,
} from '@/lib/db/schema';
import { upsertInstallation } from '@/lib/github/installation';
import { syncRepositoryCommits } from '@/lib/github/sync';
import {
  findUserInstallation,
  getGithubUserToken,
  GithubUserTokenError,
  listUserInstallationRepositories,
} from '@/lib/github/user-api';

const parseId = (value: FormDataEntryValue | null) => {
  const id = Number(value);

  return Number.isSafeInteger(id) && id > 0 ? id : null;
};

// GitHub 토큰 만료 시 재로그인 안내 화면으로 이동
const withGithubToken = async <T>(
  userId: string,
  callback: (token: string) => Promise<T>,
) => {
  try {
    const token = await getGithubUserToken(userId, await headers());

    return await callback(token);
  } catch (error) {
    if (error instanceof GithubUserTokenError) {
      redirect('/dashboard/repositories?status=github_reauth');
    }

    throw error;
  }
};

// 설치된 저장소 중 하나를 대시보드 추적 대상으로 등록하고 최초 커밋 동기화
export async function connectRepository(formData: FormData) {
  const { user } = await requireSession();
  const installationId = parseId(formData.get('installationId'));
  const githubRepoId = parseId(formData.get('githubRepoId'));

  if (!installationId || !githubRepoId) {
    redirect('/dashboard/repositories?status=invalid_repository');
  }

  // 사용자가 GitHub 상에서 해당 설치와 저장소에 실제로 접근 가능한지 확인
  const verified = await withGithubToken(user.id, async (token) => {
    const installation = await findUserInstallation(token, installationId);

    if (!installation) {
      return null;
    }

    const repositories = await listUserInstallationRepositories(
      token,
      installationId,
    );
    const repository = repositories.find(({ id }) => id === githubRepoId);

    return repository ? { installation, repository } : null;
  });

  if (!verified) {
    redirect('/dashboard/repositories?status=invalid_repository');
  }

  const { installation, repository } = verified;
  const installationRow = await upsertInstallation(installation, user.id);

  const metadata = {
    installationId: installationRow.id,
    ownerLogin: repository.owner.login,
    name: repository.name,
    fullName: repository.full_name,
    description: repository.description,
    isPrivate: repository.private,
    defaultBranch: repository.default_branch,
    htmlUrl: repository.html_url,
  };

  const [repositoryRow] = await db
    .insert(githubRepository)
    .values({
      id: crypto.randomUUID(),
      githubRepoId: repository.id,
      ...metadata,
    })
    .onConflictDoUpdate({
      target: githubRepository.githubRepoId,
      set: metadata,
    })
    .returning({
      id: githubRepository.id,
      lastSyncedAt: githubRepository.lastSyncedAt,
    });

  await db
    .insert(userRepository)
    .values({ userId: user.id, repositoryId: repositoryRow.id })
    .onConflictDoNothing();

  if (!repositoryRow.lastSyncedAt) {
    await syncRepositoryCommits(repositoryRow.id);
  }

  revalidatePath('/dashboard');
  redirect(`/dashboard/repositories/${repositoryRow.id}`);
}

// 사용자가 등록한 저장소인지 확인 후 반환
const findUserRepository = async (userId: string, repositoryId: string) => {
  const [repository] = await db
    .select({
      id: githubRepository.id,
      githubRepoId: githubRepository.githubRepoId,
      installationId: githubInstallation.installationId,
    })
    .from(userRepository)
    .innerJoin(
      githubRepository,
      eq(userRepository.repositoryId, githubRepository.id),
    )
    .innerJoin(
      githubInstallation,
      eq(githubRepository.installationId, githubInstallation.id),
    )
    .where(
      and(
        eq(userRepository.userId, userId),
        eq(userRepository.repositoryId, repositoryId),
      ),
    )
    .limit(1);

  return repository ?? null;
};

// 수동 커밋 동기화 (GitHub 상의 접근 권한이 유지되고 있는지 재확인 후 진행)
export async function syncRepository(formData: FormData) {
  const { user } = await requireSession();
  const repositoryId = String(formData.get('repositoryId') ?? '');
  const repository = await findUserRepository(user.id, repositoryId);

  if (!repository) {
    redirect('/dashboard?status=invalid_repository');
  }

  const hasAccess = await withGithubToken(user.id, async (token) => {
    const repositories = await listUserInstallationRepositories(
      token,
      repository.installationId,
    ).catch(() => []);

    return repositories.some(({ id }) => id === repository.githubRepoId);
  });

  if (!hasAccess) {
    redirect(`/dashboard/repositories/${repositoryId}?status=access_revoked`);
  }

  await syncRepositoryCommits(repository.id);

  revalidatePath('/dashboard');
  revalidatePath(`/dashboard/repositories/${repositoryId}`);
}

// 대시보드에서 저장소 제거 (다른 사용자가 등록하지 않은 저장소면 커밋 데이터까지 삭제)
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

  revalidatePath('/dashboard');
  redirect('/dashboard');
}
