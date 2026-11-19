import 'server-only';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { ADMIN_PAGE_SIZE } from '@/lib/admin/pagination';
import { escapeLike } from '@/lib/admin/search';
import { db } from '@/lib/db';
import { adminAccount, adminActionLog } from '@/lib/db/schema/admin';
import { user } from '@/lib/db/schema/auth';
import { draft, draftPrompt } from '@/lib/db/schema/draft';

/**
 * 어드민 프롬프트 내역 조회 (읽기 전용)
 * - 어드민이 숨긴 행(deletedAt)도 모두 보여 주고 표시만 함
 */

const DETAIL_ACTION_LIMIT = 20;

// 목록에 보여 줄 요청 문구 길이 (전문은 상세에서만)
const PROMPT_PREVIEW_LENGTH = 80;

export interface PromptListRow {
  id: string;
  userId: string;
  userEmail: string;
  draftId: string | null;
  draftTitle: string | null;
  promptPreview: string;
  model: string;
  status: string;
  usedCost: number;
  createdAt: Date;
  hidden: boolean;
}

/**
 * 프롬프트 내역 목록 (사용자 이메일·GitHub 아이디 부분 일치, 최신순, 50개씩)
 * - 요청 문구는 앞 80자만 읽음
 */
export const listPromptHistory = async ({
  q,
  page,
}: {
  q: string;
  page: number;
}): Promise<{ rows: PromptListRow[]; total: number }> => {
  const term = q.trim();
  const pattern = `%${escapeLike(term)}%`;
  const where = term
    ? or(ilike(user.email, pattern), ilike(user.githubLogin, pattern))
    : undefined;

  const [[totals], rows] = await Promise.all([
    db
      .select({ total: count() })
      .from(draftPrompt)
      .innerJoin(user, eq(user.id, draftPrompt.userId))
      .where(where),
    db
      .select({
        id: draftPrompt.id,
        userId: draftPrompt.userId,
        userEmail: user.email,
        draftId: draftPrompt.draftId,
        draftTitle: draft.title,
        promptPreview: sql<string>`left(${draftPrompt.prompt}, ${PROMPT_PREVIEW_LENGTH})`,
        model: draftPrompt.model,
        status: draftPrompt.status,
        usedCost: draftPrompt.usedCost,
        createdAt: draftPrompt.createdAt,
        deletedAt: draftPrompt.deletedAt,
      })
      .from(draftPrompt)
      .innerJoin(user, eq(user.id, draftPrompt.userId))
      .leftJoin(draft, eq(draft.id, draftPrompt.draftId))
      .where(where)
      .orderBy(desc(draftPrompt.createdAt), desc(draftPrompt.id))
      .limit(ADMIN_PAGE_SIZE)
      .offset((Math.max(1, page) - 1) * ADMIN_PAGE_SIZE),
  ]);

  return {
    total: totals.total,
    rows: rows.map(({ deletedAt, ...rest }) => ({
      ...rest,
      hidden: deletedAt !== null,
    })),
  };
};

export interface PromptDetail {
  id: string;
  userId: string;
  userEmail: string;
  draftId: string | null;
  draftTitle: string | null;
  kind: string;
  // 요청 문구 전문 (어드민 전용 화면에서만 읽음)
  prompt: string;
  tone: string;
  postType: string;
  length: string;
  requiredBlocks: string[];
  commitShas: string[];
  referenceUrls: string[];
  locale: string;
  model: string;
  status: string;
  step: number;
  errorCode: string | null;
  usedTokens: number;
  usedCost: number;
  estimatedCost: number | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  appliedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  actions: Array<{
    id: string;
    loginId: string | null;
    action: string;
    detail: Record<string, unknown>;
    createdAt: Date;
  }>;
}

// 프롬프트 내역 상세 (없으면 null, 결과 본문·분석은 읽지 않음)
export const getPromptDetail = async (
  jobId: string,
): Promise<PromptDetail | null> => {
  const [found] = await db
    .select({
      id: draftPrompt.id,
      userId: draftPrompt.userId,
      userEmail: user.email,
      draftId: draftPrompt.draftId,
      draftTitle: draft.title,
      kind: draftPrompt.kind,
      prompt: draftPrompt.prompt,
      tone: draftPrompt.tone,
      postType: draftPrompt.postType,
      length: draftPrompt.length,
      requiredBlocks: draftPrompt.requiredBlocks,
      commitShas: draftPrompt.commitShas,
      referenceUrls: draftPrompt.referenceUrls,
      locale: draftPrompt.locale,
      model: draftPrompt.model,
      status: draftPrompt.status,
      step: draftPrompt.step,
      errorCode: draftPrompt.errorCode,
      usedTokens: draftPrompt.usedTokens,
      usedCost: draftPrompt.usedCost,
      estimatedCost: draftPrompt.estimatedCost,
      startedAt: draftPrompt.startedAt,
      finishedAt: draftPrompt.finishedAt,
      appliedAt: draftPrompt.appliedAt,
      deletedAt: draftPrompt.deletedAt,
      createdAt: draftPrompt.createdAt,
    })
    .from(draftPrompt)
    .innerJoin(user, eq(user.id, draftPrompt.userId))
    .leftJoin(draft, eq(draft.id, draftPrompt.draftId))
    .where(eq(draftPrompt.id, jobId))
    .limit(1);

  if (!found) {
    return null;
  }

  const actions = await db
    .select({
      id: adminActionLog.id,
      loginId: adminAccount.loginId,
      action: adminActionLog.action,
      detail: adminActionLog.detail,
      createdAt: adminActionLog.createdAt,
    })
    .from(adminActionLog)
    .leftJoin(adminAccount, eq(adminAccount.id, adminActionLog.adminId))
    .where(
      and(
        eq(adminActionLog.targetType, 'prompt_history'),
        eq(adminActionLog.targetId, jobId),
      ),
    )
    .orderBy(desc(adminActionLog.createdAt))
    .limit(DETAIL_ACTION_LIMIT);

  return { ...found, actions };
};
