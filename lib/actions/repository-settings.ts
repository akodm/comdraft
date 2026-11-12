'use server';

import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { refresh } from 'next/cache';
import { headers } from 'next/headers';
import { requireSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { draft, draftPrompt, post, userRepository } from '@/lib/db/schema';
import { isGenerationErrorCode } from '@/lib/generation/contract';
import { getUserQuota } from '@/lib/generation/quota-queries';
import {
  getGithubUserToken,
  GithubApiError,
  GithubUserTokenError,
  listUserRepositoryBranches,
} from '@/lib/github/user-api';
import {
  pickPageEntries,
  PROMPT_HISTORY_PAGE_SIZE,
  type PromptHistoryEntry,
  type PromptHistoryItem,
} from '@/lib/studio/prompt-history';
import { getStudioRepository } from '@/lib/studio/queries';

export interface PromptHistoryPage {
  entries: PromptHistoryEntry[];
  // 다음 페이지를 이어 불러올 기준 (이 페이지 마지막 초안 작성 요청의 id, 없으면 끝)
  nextCursor: string | null;
}

export type RepositorySettingsResult =
  | {
      status: 'ok';
      history: PromptHistoryPage;
      // 저장소를 삭제하면 함께 지워지는 초안·게시글 수 (확인 창 문구용)
      draftCount: number;
      postCount: number;
    }
  | { status: 'not_found' };

const ownedDraftCondition = (userId: string, repositoryId: string) =>
  and(eq(draft.userId, userId), eq(draft.repositoryId, repositoryId));

const historyColumns = {
  id: draftPrompt.id,
  draftId: draft.id,
  kind: draftPrompt.kind,
  prompt: draftPrompt.prompt,
  commitShas: draftPrompt.commitShas,
  status: draftPrompt.status,
  errorCode: draftPrompt.errorCode,
  createdAt: draftPrompt.createdAt,
  usedCost: draftPrompt.usedCost,
};

// 기준 요청의 (요청 시각, id) 를 DB 에서 그대로 비교 (JS Date 로 옮기면 마이크로초가 잘려 경계가 어긋남)
const anchorRow = (id: string) =>
  sql`(select anchor.created_at, anchor.id from ${draftPrompt} as anchor where anchor.id = ${id})`;

/**
 * 프롬프트 내역 한 페이지 (초안 작성 요청 최신순 5개 + 각 요청에 딸린 빈칸 채우기)
 * - 커서는 앞 페이지 마지막 초안 작성 요청 id, 위조되었거나 없는 id 면 빈 페이지
 * - 요청마다 주간 제공량 대비 사용 비율 (금액은 내보내지 않음)
 */
const loadPromptHistoryPage = async (
  userId: string,
  repositoryId: string,
  cursor: string | null,
): Promise<PromptHistoryPage> => {
  const owned = ownedDraftCondition(userId, repositoryId);

  const jobRows = await db
    .select(historyColumns)
    .from(draftPrompt)
    .innerJoin(draft, eq(draftPrompt.draftId, draft.id))
    .where(
      and(
        owned,
        eq(draftPrompt.kind, 'draft'),
        cursor === null
          ? undefined
          : sql`(${draftPrompt.createdAt}, ${draftPrompt.id}) < ${anchorRow(cursor)}`,
      ),
    )
    .orderBy(desc(draftPrompt.createdAt), desc(draftPrompt.id))
    // 한 개 더 조회해 다음 페이지 존재 여부 확인
    .limit(PROMPT_HISTORY_PAGE_SIZE + 1);

  const pageRows = jobRows.slice(0, PROMPT_HISTORY_PAGE_SIZE);
  const oldest = pageRows.at(-1);

  if (!oldest) {
    return { entries: [], nextCursor: null };
  }

  // 같은 초안들에서 이 페이지의 가장 오래된 요청 이후에 보낸 요청 (빈칸 채우기를 알맞은 요청에 붙이는 데 씀)
  const [relatedRows, quota] = await Promise.all([
    db
      .select(historyColumns)
      .from(draftPrompt)
      .innerJoin(draft, eq(draftPrompt.draftId, draft.id))
      .where(
        and(
          owned,
          inArray(draft.id, [...new Set(pageRows.map((row) => row.draftId))]),
          sql`(${draftPrompt.createdAt}, ${draftPrompt.id}) >= ${anchorRow(oldest.id)}`,
        ),
      ),
    getUserQuota(userId),
  ]);

  const limit = quota?.limit ?? 0;
  const toItem = (row: (typeof jobRows)[number]): PromptHistoryItem => ({
    id: row.id,
    draftId: row.draftId,
    kind: row.kind,
    prompt: row.prompt,
    commitShas: row.commitShas,
    // 사용자가 취소한 작업은 실패가 아니라 그냥 끝난 요청으로 봄
    status:
      row.status === 'failed' &&
      isGenerationErrorCode(row.errorCode) &&
      row.errorCode === 'cancelled'
        ? 'completed'
        : row.status,
    createdAt: row.createdAt.toISOString(),
    usageRatio: limit > 0 ? row.usedCost / limit : null,
  });

  return {
    entries: pickPageEntries(pageRows.map(toItem), relatedRows.map(toItem)),
    nextCursor: jobRows.length > PROMPT_HISTORY_PAGE_SIZE ? oldest.id : null,
  };
};

/**
 * 저장소 설정 탭을 열 때 한 번 부르는 조회
 * - 프롬프트 내역 첫 페이지 (이후는 loadMorePromptHistory 로 무한 스크롤)
 * - 삭제 확인 창에 쓸 초안·게시글 수
 */
export async function getRepositorySettings(
  repositoryId: string,
): Promise<RepositorySettingsResult> {
  const { user } = await requireSession();
  const repository = await getStudioRepository(user.id, repositoryId);

  if (!repository) {
    return { status: 'not_found' };
  }

  const owned = ownedDraftCondition(user.id, repository.id);

  const [history, [{ draftCount }], [{ postCount }]] = await Promise.all([
    loadPromptHistoryPage(user.id, repository.id, null),
    db.select({ draftCount: count() }).from(draft).where(owned),
    db
      .select({ postCount: count() })
      .from(post)
      .innerJoin(draft, eq(post.draftId, draft.id))
      .where(owned),
  ]);

  return { status: 'ok', history, draftCount, postCount };
}

export type PromptHistoryPageResult =
  | ({ status: 'ok' } & PromptHistoryPage)
  | { status: 'not_found' };

/**
 * 저장소 설정: 프롬프트 내역 목록 끝에 닿으면 다음 5개 조회
 */
export async function loadMorePromptHistory(
  repositoryId: string,
  cursor: string,
): Promise<PromptHistoryPageResult> {
  const { user } = await requireSession();
  const repository = await getStudioRepository(user.id, repositoryId);

  if (!repository || typeof cursor !== 'string' || !cursor) {
    return { status: 'not_found' };
  }

  return {
    status: 'ok',
    ...(await loadPromptHistoryPage(user.id, repository.id, cursor)),
  };
}

export type RepositoryBranchesResult =
  | { status: 'ok'; defaultBranch: string; branches: string[] }
  | { status: 'github_reauth' | 'unavailable' | 'error' };

// 저장소의 브랜치 목록 (기본 브랜치를 맨 앞에, 나머지는 GitHub 응답 순서)
const loadBranches = async (
  userId: string,
  repository: { ownerLogin: string; name: string },
): Promise<string[]> => {
  const token = await getGithubUserToken(userId, await headers());

  return listUserRepositoryBranches(token, {
    owner: repository.ownerLogin,
    repo: repository.name,
  });
};

const toBranchError = (
  error: unknown,
): { status: 'github_reauth' | 'unavailable' | 'error' } => {
  if (error instanceof GithubUserTokenError) {
    return { status: 'github_reauth' };
  }

  // 403/404: 저장소 권한이 해제됨, 그 밖(rate limit, 5xx)은 일시적 오류
  if (
    error instanceof GithubApiError &&
    (error.status === 403 || error.status === 404)
  ) {
    return { status: 'unavailable' };
  }

  if (error instanceof GithubApiError) {
    return { status: 'error' };
  }

  throw error;
};

/**
 * 저장소 설정: 연동 브랜치 선택 상자를 처음 펼칠 때 GitHub 에서 브랜치 목록 조회
 */
export async function listRepositoryBranchOptions(
  repositoryId: string,
): Promise<RepositoryBranchesResult> {
  const { user } = await requireSession();
  const repository = await getStudioRepository(user.id, repositoryId);

  if (!repository) {
    return { status: 'unavailable' };
  }

  try {
    const branches = await loadBranches(user.id, repository);
    const { defaultBranch } = repository;

    return {
      status: 'ok',
      defaultBranch,
      branches: branches.includes(defaultBranch)
        ? [defaultBranch, ...branches.filter((name) => name !== defaultBranch)]
        : branches,
    };
  } catch (error) {
    return toBranchError(error);
  }
}

export type ChangeRepositoryBranchResult =
  | { status: 'changed'; branch: string }
  | { status: 'invalid' | 'github_reauth' | 'unavailable' | 'error' };

/**
 * 저장소 설정: 연동 브랜치 변경 (선택 즉시 적용)
 * - 고른 브랜치가 GitHub 에 실제로 있는지 다시 확인한 뒤 저장 (화면 값을 그대로 믿지 않음)
 * - 저장 후 화면을 다시 렌더링해 스튜디오가 새 브랜치 기준으로 커밋을 다시 불러오게 함
 */
export async function changeRepositoryBranch(
  repositoryId: string,
  branch: string,
): Promise<ChangeRepositoryBranchResult> {
  const { user } = await requireSession();
  const repository = await getStudioRepository(user.id, repositoryId);

  if (!repository) {
    return { status: 'unavailable' };
  }

  if (typeof branch !== 'string' || !branch) {
    return { status: 'invalid' };
  }

  try {
    const branches = await loadBranches(user.id, repository);

    if (!branches.includes(branch)) {
      return { status: 'invalid' };
    }
  } catch (error) {
    return toBranchError(error);
  }

  await db
    .update(userRepository)
    .set({ branch })
    .where(
      and(
        eq(userRepository.userId, user.id),
        eq(userRepository.repositoryId, repository.id),
      ),
    );

  refresh();

  return { status: 'changed', branch };
}
