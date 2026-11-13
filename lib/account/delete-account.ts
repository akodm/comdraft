import 'server-only';
import { and, eq, inArray, notExists } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  githubInstallation,
  githubRepository,
  postView,
  user,
  userRepository,
} from '@/lib/db/schema';
import { removeUserImageFolders } from '@/lib/images/storage';

/**
 * 회원과 그 데이터를 한 트랜잭션에서 삭제
 * - user 행을 지우면 세션, GitHub 계정(토큰), 초안·게시글(과 그 조회 기록), AI 작업, 이미지 행, 저장소 연동이 함께 지워짐
 * - 따로 지우는 것: 본인이 남긴 조회 기록(user:{id}), 남은 사용자가 없는 저장소 정보,
 *   본인이 설치했고 남은 저장소가 없는 GitHub App 설치 정보
 */
export const deleteUserData = async (userId: string): Promise<void> => {
  await db.transaction(async (tx) => {
    const repositories = await tx
      .select({ id: userRepository.repositoryId })
      .from(userRepository)
      .where(eq(userRepository.userId, userId));
    const installations = await tx
      .select({ id: githubInstallation.id })
      .from(githubInstallation)
      .where(eq(githubInstallation.installedByUserId, userId));

    await tx.delete(postView).where(eq(postView.viewerKey, `user:${userId}`));
    await tx.delete(user).where(eq(user.id, userId));

    if (repositories.length > 0) {
      await tx.delete(githubRepository).where(
        and(
          inArray(
            githubRepository.id,
            repositories.map(({ id }) => id),
          ),
          notExists(
            tx
              .select({ id: userRepository.repositoryId })
              .from(userRepository)
              .where(eq(userRepository.repositoryId, githubRepository.id)),
          ),
        ),
      );
    }

    if (installations.length > 0) {
      await tx.delete(githubInstallation).where(
        and(
          inArray(
            githubInstallation.id,
            installations.map(({ id }) => id),
          ),
          notExists(
            tx
              .select({ id: githubRepository.id })
              .from(githubRepository)
              .where(
                eq(githubRepository.installationId, githubInstallation.id),
              ),
          ),
        ),
      );
    }
  });
};

/** 탈퇴한 회원의 이미지 파일 (공개 버킷의 변환본과 임시 버킷의 원본, 실패해도 탈퇴 결과는 바꾸지 않음) */
export const removeUserFiles = async (userId: string): Promise<void> => {
  await removeUserImageFolders(userId);
};
