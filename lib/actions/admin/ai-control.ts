'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import {
  AI_GENERATION_SETTING_KEY,
  serviceSetting,
  type AiGenerationSetting,
} from '@/lib/db/schema/admin';
import { logAdminAction } from '@/lib/admin/audit';
import { requireAdmin, requireAdminKey } from '@/lib/admin/guard';
import { adminPath } from '@/lib/admin/path-key';
import { getRequestLocale } from '@/lib/i18n/request';

// 중지 사유 최대 길이 (ConfirmActionButton 의 입력 제한과 같은 기준)
const REASON_MAX_LENGTH = 500;

// 중지 사유 (앞뒤 공백을 떼고 1~500자만 허용)
const readReason = (formData: FormData): string => {
  const value = formData.get('reason');
  const reason = typeof value === 'string' ? value.trim() : '';

  if (reason.length < 1 || reason.length > REASON_MAX_LENGTH) {
    throw new Error('invalid_reason');
  }

  return reason;
};

// ai_generation 설정 한 행을 덮어씀
const saveSetting = async (
  value: AiGenerationSetting,
  adminId: string,
): Promise<void> => {
  await db
    .insert(serviceSetting)
    .values({ key: AI_GENERATION_SETTING_KEY, value, updatedBy: adminId })
    .onConflictDoUpdate({
      target: serviceSetting.key,
      set: { value, updatedBy: adminId, updatedAt: new Date() },
    });
};

const revalidateControl = async (): Promise<void> => {
  revalidatePath(
    adminPath(await getRequestLocale(), requireAdminKey(), 'ai-control'),
  );
};

/** AI 작성 일시 중지 (admin): 새 작성 요청을 거부하게 함, 사유 필수 */
export async function pauseAiGeneration(formData: FormData): Promise<void> {
  const admin = await requireAdmin('ai.pause');
  const reason = readReason(formData);

  await saveSetting({ paused: true, reason }, admin.adminId);
  await logAdminAction({
    adminId: admin.adminId,
    action: 'ai.pause',
    targetType: 'service_setting',
    targetId: AI_GENERATION_SETTING_KEY,
    detail: { reason },
  });
  await revalidateControl();
}

/** AI 작성 재개 (admin) */
export async function resumeAiGeneration(): Promise<void> {
  const admin = await requireAdmin('ai.resume');

  await saveSetting({ paused: false, reason: null }, admin.adminId);
  await logAdminAction({
    adminId: admin.adminId,
    action: 'ai.resume',
    targetType: 'service_setting',
    targetId: AI_GENERATION_SETTING_KEY,
  });
  await revalidateControl();
}
