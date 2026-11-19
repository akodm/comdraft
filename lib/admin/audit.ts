import 'server-only';
import { db } from '@/lib/db';
import { adminActionLog } from '@/lib/db/schema/admin';
import type { AdminAction } from '@/lib/admin/roles';

export type AdminLogAction =
  | AdminAction
  | 'auth.login'
  | 'auth.password'
  | 'auth.logout';

export interface AdminActionLogInput {
  adminId: string;
  action: AdminLogAction;
  targetType: string;
  targetId?: string;
  // 비밀번호·프롬프트 원문 같은 민감한 값은 넣지 않음
  detail?: Record<string, unknown>;
}

// 어드민 작업 기록 (admin_action_log)
export async function logAdminAction(
  input: AdminActionLogInput,
): Promise<void> {
  await db.insert(adminActionLog).values({
    id: crypto.randomUUID(),
    adminId: input.adminId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    detail: input.detail ?? {},
  });
}
