import 'server-only';
import { and, count, desc, eq, ilike, or } from 'drizzle-orm';
import { ADMIN_PAGE_SIZE } from '@/lib/admin/pagination';
import { db } from '@/lib/db';
import { adminAccount, adminActionLog } from '@/lib/db/schema/admin';
import { session, user } from '@/lib/db/schema/auth';
import { draftPrompt } from '@/lib/db/schema/draft';
import { post } from '@/lib/db/schema/post';
import { quotaPlan } from '@/lib/db/schema/quota';
import { getUserQuota } from '@/lib/generation/quota-queries';
import type { QuotaSummary } from '@/lib/generation/quota';

/**
 * 어드민 사용자 조회 (읽기 전용)
 */

// 상세에 보여 줄 최근 작업·조치 기록 수
const DETAIL_PROMPT_LIMIT = 20;
const DETAIL_ACTION_LIMIT = 20;

export interface UserListRow {
  id: string;
  email: string;
  githubLogin: string | null;
  role: string;
  bannedAt: Date | null;
  createdAt: Date;
  // 이번 주 사용량 (등급 정책이 없으면 null)
  quota: QuotaSummary | null;
}

// LIKE 의 와일드카드(%, _, \)를 글자 그대로 찾도록 이스케이프
const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (char) => `\\${char}`);

/**
 * 사용자 목록 (이메일·GitHub 아이디 부분 일치, 최근 가입순, 50개씩)
 * - 이번 주 사용량은 getUserQuota 를 행마다 불러 구함 (최대 50번, 초기화 시각 규칙을 그대로 따름)
 */
export const listUsers = async ({
  q,
  page,
}: {
  q: string;
  page: number;
}): Promise<{ rows: UserListRow[]; total: number }> => {
  const term = q.trim();
  const pattern = `%${escapeLike(term)}%`;
  const where = term
    ? or(ilike(user.email, pattern), ilike(user.githubLogin, pattern))
    : undefined;

  const [[totals], users] = await Promise.all([
    db.select({ total: count() }).from(user).where(where),
    db
      .select({
        id: user.id,
        email: user.email,
        githubLogin: user.githubLogin,
        role: user.role,
        bannedAt: user.bannedAt,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(where)
      .orderBy(desc(user.createdAt), user.id)
      .limit(ADMIN_PAGE_SIZE)
      .offset((Math.max(1, page) - 1) * ADMIN_PAGE_SIZE),
  ]);

  const quotas = await Promise.all(users.map((row) => getUserQuota(row.id)));

  return {
    total: totals.total,
    rows: users.map((row, index) => ({ ...row, quota: quotas[index] })),
  };
};

export interface UserDetail {
  user: {
    id: string;
    name: string;
    email: string;
    githubLogin: string | null;
    role: string;
    bannedAt: Date | null;
    banReason: string | null;
    quotaResetAt: Date | null;
    createdAt: Date;
  };
  quota: QuotaSummary | null;
  // 선택할 수 있는 등급 (quota_plan.role)
  plans: string[];
  sessionCount: number;
  postCount: number;
  // 최근 작업 (어드민이 숨긴 것도 포함)
  prompts: Array<{
    id: string;
    status: string;
    model: string;
    usedCost: number;
    createdAt: Date;
    hidden: boolean;
  }>;
  actions: Array<{
    id: string;
    loginId: string | null;
    action: string;
    detail: Record<string, unknown>;
    createdAt: Date;
  }>;
}

// 사용자 상세 (없으면 null)
export const getUserDetail = async (
  userId: string,
): Promise<UserDetail | null> => {
  const [found] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      githubLogin: user.githubLogin,
      role: user.role,
      bannedAt: user.bannedAt,
      banReason: user.banReason,
      quotaResetAt: user.quotaResetAt,
      createdAt: user.createdAt,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!found) {
    return null;
  }

  const [quota, plans, [posts], [sessions], prompts, actions] =
    await Promise.all([
      getUserQuota(userId),
      db
        .select({ role: quotaPlan.role })
        .from(quotaPlan)
        .orderBy(quotaPlan.role),
      db.select({ total: count() }).from(post).where(eq(post.userId, userId)),
      db
        .select({ total: count() })
        .from(session)
        .where(eq(session.userId, userId)),
      db
        .select({
          id: draftPrompt.id,
          status: draftPrompt.status,
          model: draftPrompt.model,
          usedCost: draftPrompt.usedCost,
          createdAt: draftPrompt.createdAt,
          deletedAt: draftPrompt.deletedAt,
        })
        .from(draftPrompt)
        .where(eq(draftPrompt.userId, userId))
        .orderBy(desc(draftPrompt.createdAt))
        .limit(DETAIL_PROMPT_LIMIT),
      db
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
            eq(adminActionLog.targetType, 'user'),
            eq(adminActionLog.targetId, userId),
          ),
        )
        .orderBy(desc(adminActionLog.createdAt))
        .limit(DETAIL_ACTION_LIMIT),
    ]);

  return {
    user: found,
    quota,
    plans: plans.map((plan) => plan.role),
    sessionCount: sessions.total,
    postCount: posts.total,
    prompts: prompts.map(({ deletedAt, ...rest }) => ({
      ...rest,
      hidden: deletedAt !== null,
    })),
    actions,
  };
};
