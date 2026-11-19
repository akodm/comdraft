import 'server-only';
import { count, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import {
  markStale,
  resolveStatsWindow,
  summarizeModelUsage,
} from '@/lib/admin/stats';
import type { ModelUsage } from '@/lib/admin/stats';
import { db } from '@/lib/db';
import { adminAccount, adminActionLog } from '@/lib/db/schema/admin';
import { user } from '@/lib/db/schema/auth';
import { draftPrompt } from '@/lib/db/schema/draft';
import { post } from '@/lib/db/schema/post';
import { quotaPlan } from '@/lib/db/schema/quota';
import type { GenerationModel } from '@/lib/generation/contract';
import { toQuotaPlan } from '@/lib/generation/quota';

/**
 * 어드민 대시보드 조회 (읽기 전용)
 */

// 기본 등급 (통계의 "이번 주" 기준)
const BASIC_PLAN_ROLE = 'basic';

// 진행 중인 AI 작업 상태
const ACTIVE_STATUSES = ['queued', 'running', 'awaiting_input'] as const;

// 진행 중인 작업 목록 최대 개수
const ACTIVE_JOBS_LIMIT = 100;

export interface DashboardStats {
  // 이번 주 기준 시작과, 기본 등급이 없어 최근 7일로 대신했는지
  windowStart: Date;
  windowFallback: boolean;
  users: {
    total: number;
    newThisWeek: number;
    banned: number;
    byRole: Array<{ role: string; count: number }>;
  };
  posts: {
    total: number;
    byVisibility: Array<{ visibility: string; count: number }>;
    banned: number;
    newThisWeek: number;
  };
  ai: {
    jobs: number;
    cost: number;
    failed: number;
    byModel: ModelUsage[];
  };
}

export interface ActiveJobRow {
  id: string;
  email: string;
  model: GenerationModel;
  status: (typeof ACTIVE_STATUSES)[number];
  step: number;
  startedAt: Date | null;
  createdAt: Date;
  stale: boolean;
}

export interface RecentAdminAction {
  id: string;
  loginId: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  detail: Record<string, unknown>;
  createdAt: Date;
}

// 기본 등급 정책 (없으면 null)
const getBasicPlan = async () => {
  const [row] = await db
    .select()
    .from(quotaPlan)
    .where(eq(quotaPlan.role, BASIC_PLAN_ROLE))
    .limit(1);

  return row ? toQuotaPlan(row) : null;
};

export const getDashboardStats = async (now: Date): Promise<DashboardStats> => {
  const { start, fallback } = resolveStatsWindow(now, await getBasicPlan());

  const [
    [userTotals],
    userRoles,
    [postTotals],
    postVisibilities,
    // AI 통계는 숨긴 작업도 실제 사용이므로 deleted_at 을 거르지 않음
    aiRows,
  ] = await Promise.all([
    db
      .select({
        total: count(),
        newThisWeek: count(
          sql`case when ${user.createdAt} >= ${start} then 1 end`,
        ),
        banned: count(user.bannedAt),
      })
      .from(user),
    db
      .select({ role: user.role, count: count() })
      .from(user)
      .groupBy(user.role)
      .orderBy(user.role),
    db
      .select({
        total: count(),
        banned: count(post.bannedAt),
        newThisWeek: count(
          sql`case when ${post.publishedAt} >= ${start} then 1 end`,
        ),
      })
      .from(post),
    db
      .select({ visibility: post.visibility, count: count() })
      .from(post)
      .groupBy(post.visibility)
      .orderBy(post.visibility),
    db
      .select({
        model: draftPrompt.model,
        usedCost: draftPrompt.usedCost,
        status: draftPrompt.status,
      })
      .from(draftPrompt)
      .where(gte(draftPrompt.createdAt, start)),
  ]);

  return {
    windowStart: start,
    windowFallback: fallback,
    users: {
      total: userTotals.total,
      newThisWeek: userTotals.newThisWeek,
      banned: userTotals.banned,
      byRole: userRoles,
    },
    posts: {
      total: postTotals.total,
      byVisibility: postVisibilities,
      banned: postTotals.banned,
      newThisWeek: postTotals.newThisWeek,
    },
    ai: {
      jobs: aiRows.length,
      cost: aiRows.reduce((sum, row) => sum + row.usedCost, 0),
      failed: aiRows.filter((row) => row.status === 'failed').length,
      byModel: summarizeModelUsage(aiRows),
    },
  };
};

export const getActiveJobs = async (now: Date): Promise<ActiveJobRow[]> => {
  const rows = await db
    .select({
      id: draftPrompt.id,
      email: user.email,
      model: draftPrompt.model,
      status: draftPrompt.status,
      step: draftPrompt.step,
      startedAt: draftPrompt.startedAt,
      createdAt: draftPrompt.createdAt,
    })
    .from(draftPrompt)
    .innerJoin(user, eq(user.id, draftPrompt.userId))
    .where(inArray(draftPrompt.status, [...ACTIVE_STATUSES]))
    .orderBy(draftPrompt.createdAt)
    .limit(ACTIVE_JOBS_LIMIT);

  return markStale(
    rows.map((row) => ({
      ...row,
      // 조회 조건이 활성 상태만 거르므로 좁힘
      status: row.status as ActiveJobRow['status'],
    })),
    now,
  );
};

export const getRecentAdminActions = async (
  limit = 20,
): Promise<RecentAdminAction[]> => {
  return db
    .select({
      id: adminActionLog.id,
      loginId: adminAccount.loginId,
      action: adminActionLog.action,
      targetType: adminActionLog.targetType,
      targetId: adminActionLog.targetId,
      detail: adminActionLog.detail,
      createdAt: adminActionLog.createdAt,
    })
    .from(adminActionLog)
    .leftJoin(adminAccount, eq(adminAccount.id, adminActionLog.adminId))
    .orderBy(desc(adminActionLog.createdAt))
    .limit(limit);
};
