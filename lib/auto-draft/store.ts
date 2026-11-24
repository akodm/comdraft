import 'server-only';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { ExcludedCommitReason } from '@/lib/db/schema/auto-draft';
import { getBranchHead, type AutoDraftRepo } from '@/lib/auto-draft/github';
import { db } from '@/lib/db';
import {
  account,
  githubInstallation,
  githubRepository,
  repositoryAutoDraft,
  repositoryExcludedCommit,
  user,
  userRepository,
} from '@/lib/db/schema';
import {
  DEFAULT_PROMPT_OPTIONS,
  parsePromptOptions,
  type PromptOptions,
} from '@/lib/studio/options';

/**
 * 자동 초안 설정·경계·제외 커밋 저장소 계층
 * - 커밋 메시지는 저장하지 않고 SHA 만 보관
 */

// 자동 초안 기본 옵션 (글 길이만 짧게)
const DEFAULT_AUTO_DRAFT_OPTIONS: PromptOptions = {
  ...DEFAULT_PROMPT_OPTIONS,
  length: 'short',
};

export interface AutoDraftSetting {
  enabled: boolean;
  prompt: string;
  options: PromptOptions;
  boundarySha: string | null;
}

export interface PushTarget {
  userId: string;
  repositoryId: string;
  // account.accountId (providerId 'github')
  githubAccountId: string;
  user: { id: string; role: string; bannedAt: Date | null };
  repo: AutoDraftRepo;
  setting: {
    prompt: string;
    options: PromptOptions;
    boundarySha: string | null;
  };
}

// 저장된 옵션 컬럼을 옵션 객체로 (잘못된 값이면 자동 초안 기본값)
const toOptions = (row: {
  tone: string;
  postType: string;
  length: string;
  requiredBlocks: string[];
  model: string;
}): PromptOptions => {
  return parsePromptOptions(row) ?? DEFAULT_AUTO_DRAFT_OPTIONS;
};

// 사용자가 등록한 저장소의 GitHub 조회 정보 (등록하지 않았으면 null)
export async function getAutoDraftRepo(
  userId: string,
  repositoryId: string,
): Promise<AutoDraftRepo | null> {
  const [row] = await db
    .select({
      installationId: githubInstallation.installationId,
      owner: githubRepository.ownerLogin,
      name: githubRepository.name,
      branch: userRepository.branch,
    })
    .from(userRepository)
    .innerJoin(
      githubRepository,
      eq(githubRepository.id, userRepository.repositoryId),
    )
    .innerJoin(
      githubInstallation,
      eq(githubInstallation.id, githubRepository.installationId),
    )
    .where(
      and(
        eq(userRepository.userId, userId),
        eq(userRepository.repositoryId, repositoryId),
      ),
    )
    .limit(1);

  return row ?? null;
}

// 자동 초안 설정 (행이 없으면 null)
export async function getAutoDraftSetting(
  userId: string,
  repositoryId: string,
): Promise<AutoDraftSetting | null> {
  const [row] = await db
    .select()
    .from(repositoryAutoDraft)
    .where(
      and(
        eq(repositoryAutoDraft.userId, userId),
        eq(repositoryAutoDraft.repositoryId, repositoryId),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    enabled: row.enabled,
    prompt: row.prompt,
    options: toOptions(row),
    boundarySha: row.boundarySha,
  };
}

// 요청 문구와 기본 옵션 저장 (행이 없으면 꺼진 상태로 생성)
export async function saveAutoDraftSetting(
  userId: string,
  repositoryId: string,
  values: { prompt: string; options: PromptOptions },
): Promise<void> {
  const columns = {
    prompt: values.prompt,
    tone: values.options.tone,
    postType: values.options.postType,
    length: values.options.length,
    requiredBlocks: values.options.requiredBlocks,
    model: values.options.model,
  };

  await db
    .insert(repositoryAutoDraft)
    .values({ userId, repositoryId, ...columns })
    .onConflictDoUpdate({
      target: [repositoryAutoDraft.userId, repositoryAutoDraft.repositoryId],
      set: columns,
    });
}

/**
 * 자동 초안 켜기/끄기
 * - 처음 켤 때(경계 없음)만 추적 브랜치 최신 커밋을 경계로 잡아 과거 커밋은 대상에서 제외
 * - 끌 때와 다시 켤 때는 경계를 유지
 * - unavailable: 최신 커밋을 못 구함(빈 저장소·브랜치 없음·GitHub 오류), 이때는 켜지 않음
 */
export async function setAutoDraftEnabled(
  userId: string,
  repositoryId: string,
  enabled: boolean,
): Promise<'ok' | 'not_found' | 'unavailable'> {
  const repo = await getAutoDraftRepo(userId, repositoryId);

  if (!repo) return 'not_found';

  const existing = await getAutoDraftSetting(userId, repositoryId);
  let head: string | null = null;

  // 경계가 없을 때만 최신 커밋을 구함
  if (enabled && !existing?.boundarySha) {
    try {
      head = await getBranchHead(repo);
    } catch {
      return 'unavailable';
    }

    if (head === null) return 'unavailable';
  }

  // 켜기/끄기는 enabled 만 갱신 (동시에 움직인 경계를 되돌리지 않음)
  await db
    .insert(repositoryAutoDraft)
    .values({ userId, repositoryId, enabled })
    .onConflictDoUpdate({
      target: [repositoryAutoDraft.userId, repositoryAutoDraft.repositoryId],
      set: { enabled },
    });

  // 경계는 비어 있을 때만 채움
  if (head !== null) {
    await db
      .update(repositoryAutoDraft)
      .set({ boundarySha: head })
      .where(
        and(
          eq(repositoryAutoDraft.userId, userId),
          eq(repositoryAutoDraft.repositoryId, repositoryId),
          isNull(repositoryAutoDraft.boundarySha),
        ),
      );
  }

  return 'ok';
}

// 경계를 fromSha 일 때만 toSha 로 옮김 (동시 실행 방지), 바뀐 행이 있으면 true
export async function moveBoundary(
  userId: string,
  repositoryId: string,
  fromSha: string | null,
  toSha: string,
): Promise<boolean> {
  const updated = await db
    .update(repositoryAutoDraft)
    .set({ boundarySha: toSha })
    .where(
      and(
        eq(repositoryAutoDraft.userId, userId),
        eq(repositoryAutoDraft.repositoryId, repositoryId),
        sql`${repositoryAutoDraft.boundarySha} is not distinct from ${fromSha}`,
      ),
    )
    .returning({ userId: repositoryAutoDraft.userId });

  return updated.length > 0;
}

// 제외한 커밋 SHA 와 사유
export async function listExcludedShas(
  userId: string,
  repositoryId: string,
): Promise<Map<string, ExcludedCommitReason>> {
  const rows = await db
    .select({
      sha: repositoryExcludedCommit.sha,
      reason: repositoryExcludedCommit.reason,
    })
    .from(repositoryExcludedCommit)
    .where(
      and(
        eq(repositoryExcludedCommit.userId, userId),
        eq(repositoryExcludedCommit.repositoryId, repositoryId),
      ),
    );

  return new Map(rows.map((row) => [row.sha, row.reason]));
}

// 커밋을 자동 초안 대상에서 제외 (이미 제외된 SHA 는 무시)
export async function excludeCommits(
  userId: string,
  repositoryId: string,
  shas: string[],
  reason: ExcludedCommitReason,
): Promise<void> {
  if (shas.length === 0) return;

  await db
    .insert(repositoryExcludedCommit)
    .values(shas.map((sha) => ({ userId, repositoryId, sha, reason })))
    .onConflictDoNothing();
}

// 제외한 커밋을 다시 대상으로 되돌림
export async function restoreCommit(
  userId: string,
  repositoryId: string,
  sha: string,
): Promise<void> {
  await db
    .delete(repositoryExcludedCommit)
    .where(
      and(
        eq(repositoryExcludedCommit.userId, userId),
        eq(repositoryExcludedCommit.repositoryId, repositoryId),
        eq(repositoryExcludedCommit.sha, sha),
      ),
    );
}

// push 된 저장소·브랜치를 추적하면서 자동 초안이 켜진 연결
export async function findPushTargets(
  githubRepoId: number,
  branch: string,
): Promise<PushTarget[]> {
  const rows = await db
    .select({
      userId: userRepository.userId,
      repositoryId: userRepository.repositoryId,
      githubAccountId: account.accountId,
      userRole: user.role,
      userBannedAt: user.bannedAt,
      installationId: githubInstallation.installationId,
      owner: githubRepository.ownerLogin,
      name: githubRepository.name,
      branch: userRepository.branch,
      prompt: repositoryAutoDraft.prompt,
      tone: repositoryAutoDraft.tone,
      postType: repositoryAutoDraft.postType,
      length: repositoryAutoDraft.length,
      requiredBlocks: repositoryAutoDraft.requiredBlocks,
      model: repositoryAutoDraft.model,
      boundarySha: repositoryAutoDraft.boundarySha,
    })
    .from(userRepository)
    .innerJoin(
      githubRepository,
      eq(githubRepository.id, userRepository.repositoryId),
    )
    .innerJoin(
      githubInstallation,
      eq(githubInstallation.id, githubRepository.installationId),
    )
    .innerJoin(
      repositoryAutoDraft,
      and(
        eq(repositoryAutoDraft.userId, userRepository.userId),
        eq(repositoryAutoDraft.repositoryId, userRepository.repositoryId),
      ),
    )
    .innerJoin(user, eq(user.id, userRepository.userId))
    .innerJoin(
      account,
      and(eq(account.userId, user.id), eq(account.providerId, 'github')),
    )
    .where(
      and(
        eq(githubRepository.githubRepoId, githubRepoId),
        eq(userRepository.branch, branch),
        eq(repositoryAutoDraft.enabled, true),
      ),
    );

  return rows.map((row) => ({
    userId: row.userId,
    repositoryId: row.repositoryId,
    githubAccountId: row.githubAccountId,
    user: { id: row.userId, role: row.userRole, bannedAt: row.userBannedAt },
    repo: {
      installationId: row.installationId,
      owner: row.owner,
      name: row.name,
      branch: row.branch,
    },
    setting: {
      prompt: row.prompt,
      options: toOptions(row),
      boundarySha: row.boundarySha,
    },
  }));
}

/**
 * 추적 브랜치가 바뀌었을 때 경계를 새 브랜치 최신 커밋으로 다시 잡음
 * - 자동 초안 행이 없으면 아무것도 하지 않음, 최신 커밋을 못 구하면(빈 브랜치 등) 경계를 비움
 */
export async function resetBoundaryForBranch(
  userId: string,
  repositoryId: string,
): Promise<void> {
  const setting = await getAutoDraftSetting(userId, repositoryId);

  if (!setting) return;

  const repo = await getAutoDraftRepo(userId, repositoryId);
  let head: string | null = null;

  try {
    head = repo ? await getBranchHead(repo) : null;
  } catch {
    head = null;
  }

  await db
    .update(repositoryAutoDraft)
    .set({ boundarySha: head })
    .where(
      and(
        eq(repositoryAutoDraft.userId, userId),
        eq(repositoryAutoDraft.repositoryId, repositoryId),
      ),
    );
}
