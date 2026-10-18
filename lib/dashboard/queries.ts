import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  max,
  min,
  sql,
} from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  githubCommit,
  githubInstallation,
  githubRepository,
  userRepository,
} from '@/lib/db/schema';

const DASHBOARD_TIMEZONE = 'Asia/Seoul';

// 커밋 작성자 식별: GitHub 계정이 연결되어 있으면 login, 아니면 이메일/이름
const authorKey = sql<string>`coalesce(${githubCommit.authorLogin}, ${githubCommit.authorEmail}, ${githubCommit.authorName}, 'unknown')`;

// 사용자가 등록한 저장소 목록 + 커밋 요약
export const getUserRepositories = async (userId: string) => {
  return db
    .select({
      id: githubRepository.id,
      fullName: githubRepository.fullName,
      description: githubRepository.description,
      isPrivate: githubRepository.isPrivate,
      htmlUrl: githubRepository.htmlUrl,
      lastSyncedAt: githubRepository.lastSyncedAt,
      lastSyncError: githubRepository.lastSyncError,
      commitCount: count(githubCommit.id),
      latestCommittedAt: max(githubCommit.committedAt),
    })
    .from(userRepository)
    .innerJoin(
      githubRepository,
      eq(userRepository.repositoryId, githubRepository.id),
    )
    .leftJoin(githubCommit, eq(githubCommit.repositoryId, githubRepository.id))
    .where(eq(userRepository.userId, userId))
    .groupBy(githubRepository.id)
    .orderBy(sql`${max(githubCommit.committedAt)} desc nulls last`);
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
      defaultBranch: githubRepository.defaultBranch,
      htmlUrl: githubRepository.htmlUrl,
      lastSyncedAt: githubRepository.lastSyncedAt,
      lastSyncError: githubRepository.lastSyncError,
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

// 저장소 대시보드 통계
export const getRepositoryStats = async (repositoryId: string, days = 30) => {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  // SELECT 와 GROUP BY 의 식이 같아야 하므로 타임존은 바인딩 파라미터가 아닌 상수로 삽입
  const day = sql<string>`to_char(${githubCommit.committedAt} at time zone ${sql.raw(`'${DASHBOARD_TIMEZONE}'`)}, 'YYYY-MM-DD')`;

  const [summary, dailyCommits, topAuthors, recentCommits] = await Promise.all([
    db
      .select({
        totalCommits: count(),
        contributors: countDistinct(authorKey),
        firstCommittedAt: min(githubCommit.committedAt),
        latestCommittedAt: max(githubCommit.committedAt),
      })
      .from(githubCommit)
      .where(eq(githubCommit.repositoryId, repositoryId))
      .then(([row]) => row),
    db
      .select({ day, commits: count() })
      .from(githubCommit)
      .where(
        and(
          eq(githubCommit.repositoryId, repositoryId),
          gte(githubCommit.committedAt, since),
        ),
      )
      .groupBy(day)
      .orderBy(day),
    db
      .select({
        author: authorKey,
        avatarUrl: max(githubCommit.authorAvatarUrl),
        commits: count(),
      })
      .from(githubCommit)
      .where(eq(githubCommit.repositoryId, repositoryId))
      .groupBy(authorKey)
      .orderBy(desc(count()))
      .limit(5),
    db
      .select({
        sha: githubCommit.sha,
        message: githubCommit.message,
        authorName: githubCommit.authorName,
        authorLogin: githubCommit.authorLogin,
        authorAvatarUrl: githubCommit.authorAvatarUrl,
        committedAt: githubCommit.committedAt,
        htmlUrl: githubCommit.htmlUrl,
      })
      .from(githubCommit)
      .where(eq(githubCommit.repositoryId, repositoryId))
      .orderBy(desc(githubCommit.committedAt))
      .limit(50),
  ]);

  // 커밋이 없는 날도 0 으로 채워 최근 N일 추이를 만듦
  const commitsByDay = new Map(
    dailyCommits.map((row) => [row.day, row.commits]),
  );
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TIMEZONE,
  });
  const activity = Array.from({ length: days }, (_, index) => {
    const date = new Date(
      Date.now() - (days - 1 - index) * 24 * 60 * 60 * 1000,
    );
    const key = formatter.format(date);

    return { day: key, commits: commitsByDay.get(key) ?? 0 };
  });

  return { summary, activity, topAuthors, recentCommits };
};
