import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  draft,
  githubInstallation,
  githubRepository,
  userRepository,
} from '@/lib/db/schema';

// 대시보드에서 한 번에 불러오는 저장소 수 (PC 2열 기준 6줄)
const DASHBOARD_PAGE_SIZE = 12;

// 대시보드 저장소 카드에 필요한 값
export interface DashboardRepository {
  id: string;
  ownerLogin: string;
  name: string;
  description: string | null;
  isPrivate: boolean;
  // 저장소 소유 계정 = GitHub App 이 설치된 계정 (설치는 그 계정의 저장소만 포함)
  isOrganization: boolean;
  branch: string;
  license: string | null;
  // 이 저장소에 만든 초안 수
  draftCount: number;
}

export interface DashboardRepositoryPage {
  repositories: DashboardRepository[];
  // 다음 페이지가 없으면 null
  nextCursor: string | null;
}

interface DashboardCursor {
  updatedAt: Date;
  repositoryId: string;
}

// 마지막 항목의 (변경 시각, 저장소 id) 를 불투명한 문자열로 (클라이언트는 그대로 돌려주기만 함)
const encodeCursor = ({ updatedAt, repositoryId }: DashboardCursor) => {
  return Buffer.from(
    JSON.stringify([updatedAt.toISOString(), repositoryId]),
  ).toString('base64url');
};

// 클라이언트가 보낸 커서는 위조 가능하므로 형식을 확인하고, 올바르지 않으면 null
const decodeCursor = (cursor: string): DashboardCursor | null => {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    );

    if (
      !Array.isArray(value) ||
      value.length !== 2 ||
      typeof value[0] !== 'string' ||
      typeof value[1] !== 'string' ||
      value[1].length === 0
    ) {
      return null;
    }

    const updatedAt = new Date(value[0]);

    return Number.isNaN(updatedAt.getTime())
      ? null
      : { updatedAt, repositoryId: value[1] };
  } catch {
    return null;
  }
};

/**
 * 사용자가 등록한 저장소 한 페이지 (최근 등록/변경순, 커서 기반)
 * - 같은 시각이면 저장소 id 역순으로 정렬해 순서가 항상 같고, 페이지 사이에 빠지거나 겹치는 항목이 없음
 * - updated_at 은 밀리초 정밀도라 JS Date 로 만든 커서와 그대로 비교 가능
 * - 커서가 올바르지 않으면 빈 페이지
 */
export const getDashboardRepositoryPage = async (
  userId: string,
  cursor: string | null = null,
): Promise<DashboardRepositoryPage> => {
  const after = cursor ? decodeCursor(cursor) : null;

  if (cursor && !after) {
    return { repositories: [], nextCursor: null };
  }

  const rows = await db
    .select({
      id: githubRepository.id,
      ownerLogin: githubRepository.ownerLogin,
      name: githubRepository.name,
      description: githubRepository.description,
      isPrivate: githubRepository.isPrivate,
      license: githubRepository.license,
      accountType: githubInstallation.accountType,
      branch: userRepository.branch,
      updatedAt: userRepository.updatedAt,
      draftCount: db.$count(
        draft,
        and(
          eq(draft.userId, userRepository.userId),
          eq(draft.repositoryId, userRepository.repositoryId),
        ),
      ),
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
        after
          ? sql`(${userRepository.updatedAt}, ${userRepository.repositoryId}) < (${after.updatedAt.toISOString()}::timestamptz, ${after.repositoryId})`
          : undefined,
      ),
    )
    .orderBy(desc(userRepository.updatedAt), desc(userRepository.repositoryId))
    // 한 개 더 조회해 다음 페이지 존재 여부 확인
    .limit(DASHBOARD_PAGE_SIZE + 1);

  const page = rows.slice(0, DASHBOARD_PAGE_SIZE);
  const last = page.at(-1);

  return {
    repositories: page.map((row) => ({
      id: row.id,
      ownerLogin: row.ownerLogin,
      name: row.name,
      description: row.description,
      isPrivate: row.isPrivate,
      isOrganization: row.accountType === 'Organization',
      branch: row.branch,
      license: row.license,
      draftCount: row.draftCount,
    })),
    nextCursor:
      rows.length > DASHBOARD_PAGE_SIZE && last
        ? encodeCursor({ updatedAt: last.updatedAt, repositoryId: last.id })
        : null,
  };
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
