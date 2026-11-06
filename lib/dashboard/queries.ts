import 'server-only';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  githubInstallation,
  githubRepository,
  userRepository,
} from '@/lib/db/schema';

// 사용자가 등록한 저장소 목록 (최근 등록순)
export const getUserRepositories = async (userId: string) => {
  return db
    .select({
      id: githubRepository.id,
      branch: userRepository.branch,
      fullName: githubRepository.fullName,
      description: githubRepository.description,
      isPrivate: githubRepository.isPrivate,
      htmlUrl: githubRepository.htmlUrl,
    })
    .from(userRepository)
    .innerJoin(
      githubRepository,
      eq(userRepository.repositoryId, githubRepository.id),
    )
    .where(eq(userRepository.userId, userId))
    .orderBy(desc(userRepository.createdAt));
};

// 사용자가 등록한 저장소 상세 (등록하지 않은 저장소면 null)
export const getUserRepository = async (
  userId: string,
  repositoryId: string,
) => {
  const [repository] = await db
    .select({
      id: githubRepository.id,
      fullName: githubRepository.fullName,
      description: githubRepository.description,
      isPrivate: githubRepository.isPrivate,
      branch: userRepository.branch,
      htmlUrl: githubRepository.htmlUrl,
      installationAccountLogin: githubInstallation.accountLogin,
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
