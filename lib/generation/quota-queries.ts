import 'server-only';
import { and, eq, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { draftPrompt, quotaPlan, user } from '@/lib/db/schema';
import {
  getQuotaWeek,
  summarizeQuota,
  toQuotaPlan,
  type QuotaSummary,
} from '@/lib/generation/quota';

/**
 * 사용자의 이번 주 사용량 요약
 * - 등급의 정책 행이 없으면 null
 * - 이번 주(주 시작 이후)에 만든 작업만 셈 (초안을 삭제한 작업도 사용자 기준으로 셈)
 */
export async function getUserQuota(
  userId: string,
  now: Date = new Date(),
): Promise<QuotaSummary | null> {
  const [row] = await db
    .select({ plan: quotaPlan })
    .from(user)
    .innerJoin(quotaPlan, eq(quotaPlan.role, user.role))
    .where(eq(user.id, userId))
    .limit(1);

  if (!row) {
    return null;
  }

  const plan = toQuotaPlan(row.plan);
  const { start } = getQuotaWeek(now, plan);

  const jobs = await db
    .select({
      status: draftPrompt.status,
      estimatedTokens: draftPrompt.estimatedTokens,
      usedTokens: draftPrompt.usedTokens,
      errorCode: draftPrompt.errorCode,
    })
    .from(draftPrompt)
    .where(
      and(eq(draftPrompt.userId, userId), gte(draftPrompt.createdAt, start)),
    );

  return summarizeQuota(plan, jobs, now);
}
