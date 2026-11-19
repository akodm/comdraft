'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { session, user } from '@/lib/db/schema/auth';
import { quotaPlan } from '@/lib/db/schema/quota';
import { logAdminAction } from '@/lib/admin/audit';
import { requireAdmin, requireAdminKey } from '@/lib/admin/guard';
import { adminPath } from '@/lib/admin/path-key';
import type { AdminAction } from '@/lib/admin/roles';
import { getRequestLocale } from '@/lib/i18n/request';

// 밴 사유 최대 길이 (ConfirmActionButton 의 입력 제한과 같은 기준)
const REASON_MAX_LENGTH = 500;

const readField = (formData: FormData, name: string): string => {
  const value = formData.get(name);

  return typeof value === 'string' ? value : '';
};

// 대상 사용자 id (없으면 오류)
const readUserId = (formData: FormData): string => {
  const userId = readField(formData, 'userId').trim();

  if (!userId) {
    throw new Error('invalid_user');
  }

  return userId;
};

// 밴 사유 (앞뒤 공백을 떼고 1~500자만 허용)
const readReason = (formData: FormData): string => {
  const reason = readField(formData, 'reason').trim();

  if (reason.length < 1 || reason.length > REASON_MAX_LENGTH) {
    throw new Error('invalid_reason');
  }

  return reason;
};

// 목록과 해당 사용자 상세를 다시 읽도록 표시
const revalidateUser = async (userId: string): Promise<void> => {
  const base = adminPath(await getRequestLocale(), requireAdminKey(), 'users');

  revalidatePath(base);
  revalidatePath(`${base}/${userId}`);
};

// 권한 확인 → 대상 id 읽기 (모든 액션의 공통 시작)
const begin = async (formData: FormData, action: AdminAction) => {
  const admin = await requireAdmin(action);

  return { admin, userId: readUserId(formData) };
};

/** 사용자 밴: 이용 차단 표시와 사유를 남기고 로그인 세션을 모두 끊음 */
export async function banUser(formData: FormData): Promise<void> {
  const { admin, userId } = await begin(formData, 'user.ban');
  const reason = readReason(formData);

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(user)
      .set({ bannedAt: new Date(), banReason: reason })
      .where(eq(user.id, userId))
      .returning({ id: user.id });

    if (updated.length === 0) {
      throw new Error('unknown_user');
    }

    await tx.delete(session).where(eq(session.userId, userId));
  });

  await logAdminAction({
    adminId: admin.adminId,
    action: 'user.ban',
    targetType: 'user',
    targetId: userId,
    detail: { reason },
  });
  await revalidateUser(userId);
}

/** 사용자 밴 해제 */
export async function unbanUser(formData: FormData): Promise<void> {
  const { admin, userId } = await begin(formData, 'user.unban');

  const updated = await db
    .update(user)
    .set({ bannedAt: null, banReason: null })
    .where(eq(user.id, userId))
    .returning({ id: user.id });

  if (updated.length === 0) {
    throw new Error('unknown_user');
  }

  await logAdminAction({
    adminId: admin.adminId,
    action: 'user.unban',
    targetType: 'user',
    targetId: userId,
  });
  await revalidateUser(userId);
}

/** 사용자의 로그인 세션을 모두 삭제 (다시 로그인해야 함) */
export async function revokeUserSessions(formData: FormData): Promise<void> {
  const { admin, userId } = await begin(formData, 'user.revokeSessions');

  await db.delete(session).where(eq(session.userId, userId));

  await logAdminAction({
    adminId: admin.adminId,
    action: 'user.revokeSessions',
    targetType: 'user',
    targetId: userId,
  });
  await revalidateUser(userId);
}

/** 이번 주 사용량 초기화: 지금 이후에 만든 작업만 셈 (작업 기록은 지우지 않음) */
export async function resetUserUsage(formData: FormData): Promise<void> {
  const { admin, userId } = await begin(formData, 'user.resetUsage');

  const updated = await db
    .update(user)
    .set({ quotaResetAt: new Date() })
    .where(eq(user.id, userId))
    .returning({ id: user.id });

  if (updated.length === 0) {
    throw new Error('unknown_user');
  }

  await logAdminAction({
    adminId: admin.adminId,
    action: 'user.resetUsage',
    targetType: 'user',
    targetId: userId,
  });
  await revalidateUser(userId);
}

/** 사용자 등급 변경 (quota_plan 에 있는 등급만, 사용량은 건드리지 않음) */
export async function changeUserPlan(formData: FormData): Promise<void> {
  const { admin, userId } = await begin(formData, 'user.changePlan');
  const role = readField(formData, 'role').trim();

  const [plan] = await db
    .select({ role: quotaPlan.role })
    .from(quotaPlan)
    .where(eq(quotaPlan.role, role))
    .limit(1);

  if (!plan) {
    throw new Error('unknown_plan');
  }

  const [current] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!current) {
    throw new Error('unknown_user');
  }

  await db.update(user).set({ role: plan.role }).where(eq(user.id, userId));

  // 대시보드 요약이 문자열 role 만 보여 주므로 새 등급을 role, 이전 등급을 from 에 남김
  await logAdminAction({
    adminId: admin.adminId,
    action: 'user.changePlan',
    targetType: 'user',
    targetId: userId,
    detail: { role: plan.role, from: current.role },
  });
  await revalidateUser(userId);
}
