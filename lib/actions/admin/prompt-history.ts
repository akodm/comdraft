'use server';

import { revalidatePath } from 'next/cache';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { draftPrompt } from '@/lib/db/schema/draft';
import { logAdminAction } from '@/lib/admin/audit';
import { requireAdmin, requireAdminKey } from '@/lib/admin/guard';
import { adminPath } from '@/lib/admin/path-key';
import { settledPromptCondition } from '@/lib/admin/prompt-history-rules';
import { getRequestLocale } from '@/lib/i18n/request';

const readJobId = (formData: FormData): string => {
  const value = formData.get('jobId');
  const jobId = typeof value === 'string' ? value.trim() : '';

  if (!jobId) {
    throw new Error('invalid_job');
  }

  return jobId;
};

// 목록과 해당 내역 상세를 다시 읽도록 표시
const revalidatePrompt = async (jobId: string): Promise<void> => {
  const base = adminPath(
    await getRequestLocale(),
    requireAdminKey(),
    'prompts',
  );

  revalidatePath(base);
  revalidatePath(`${base}/${jobId}`);
};

/**
 * 프롬프트 내역 숨김 (admin): deletedAt 만 기록, 행은 지우지 않음
 * - 사용량·통계·어드민 목록에는 계속 포함되고 사용자 화면에서만 빠짐
 * - 확인과 갱신을 한 문장으로 해 확인 직후 작업이 다시 시작되는 경쟁을 막음
 * - 이미 숨긴 내역은 아무것도 하지 않고 성공 (멱등, 기록도 남기지 않음)
 */
export async function deletePromptHistory(formData: FormData): Promise<void> {
  const admin = await requireAdmin('history.delete');
  const jobId = readJobId(formData);

  const updated = await db
    .update(draftPrompt)
    .set({ deletedAt: new Date() })
    .where(
      and(
        eq(draftPrompt.id, jobId),
        isNull(draftPrompt.deletedAt),
        settledPromptCondition(),
      ),
    )
    .returning({ id: draftPrompt.id });

  if (updated.length === 0) {
    // 조건에 맞는 행이 없는 이유를 다시 읽어 구분
    const [found] = await db
      .select({
        status: draftPrompt.status,
        appliedAt: draftPrompt.appliedAt,
        deletedAt: draftPrompt.deletedAt,
      })
      .from(draftPrompt)
      .where(eq(draftPrompt.id, jobId))
      .limit(1);

    if (!found) {
      throw new Error('not_found');
    }

    if (found.deletedAt) {
      return;
    }

    throw new Error('job_active');
  }

  await logAdminAction({
    adminId: admin.adminId,
    action: 'history.delete',
    targetType: 'prompt_history',
    targetId: jobId,
  });
  await revalidatePrompt(jobId);
}
