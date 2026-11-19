'use server';

import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminAccount, adminSession } from '@/lib/db/schema/admin';
import { logAdminAction } from '@/lib/admin/audit';
import {
  redirectToAdmin,
  requireAdminKey,
  requireAdminPasswordStep,
} from '@/lib/admin/guard';
import { evaluateLogin, isLocked } from '@/lib/admin/login';
import {
  isLoginIpBlocked,
  recordLoginIpFailure,
} from '@/lib/admin/login-limit';
import {
  hashPassword,
  validateNewPassword,
  verifyPassword,
} from '@/lib/admin/password';
import {
  endAdminSession,
  getAdminClientInfo,
  startAdminSession,
} from '@/lib/admin/session';

// 실패 응답은 아이디·비밀번호 중 무엇이 틀렸는지 구분하지 않음 ('locked' 는 계정 잠금일 때만)
export interface AdminLoginState {
  error?: 'invalid' | 'locked';
}

export interface AdminPasswordState {
  error?: 'too_short' | 'same_as_login' | 'mismatch' | 'wrong_current';
}

const readField = (formData: FormData, name: string): string => {
  const value = formData.get(name);

  return typeof value === 'string' ? value : '';
};

const findAccountByLoginId = async (loginId: string) => {
  const [account] = await db
    .select({
      id: adminAccount.id,
      role: adminAccount.role,
      failedAttempts: adminAccount.failedAttempts,
      lockedUntil: adminAccount.lockedUntil,
      tempPasswordHash: adminAccount.tempPasswordHash,
      passwordHash: adminAccount.passwordHash,
    })
    .from(adminAccount)
    .where(eq(adminAccount.loginId, loginId))
    .limit(1);

  return account ?? null;
};

// 실패 수를 하나 올리고, 이번 실패로 잠금이 정해졌으면 잠금 시각도 저장
const recordAccountFailure = async (
  adminId: string,
  lockUntil: Date | null,
) => {
  await db
    .update(adminAccount)
    .set({
      failedAttempts: sql`${adminAccount.failedAttempts} + 1`,
      ...(lockUntil ? { lockedUntil: lockUntil } : {}),
    })
    .where(eq(adminAccount.id, adminId));
};

const recordAccountSuccess = async (adminId: string, now: Date) => {
  await db
    .update(adminAccount)
    .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: now })
    .where(eq(adminAccount.id, adminId));
};

/**
 * 어드민 로그인 (useActionState 용)
 * 1. IP 실패 수가 한도를 넘었으면 비밀번호를 확인하지 않고 거부
 * 2. 임시 비밀번호가 있으면 임시 해시, 없으면 본인 해시로 비교 (계정이 없거나 잠금 중이면 더미 비교)
 * 3. 성공하면 세션을 만들고 콘솔 또는 비밀번호 변경 화면으로 이동
 */
export async function loginAdmin(
  _prev: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const key = requireAdminKey();
  const loginId = readField(formData, 'loginId').trim();
  const password = readField(formData, 'password');
  const { ipAddress } = await getAdminClientInfo();

  if (await isLoginIpBlocked(ipAddress)) {
    return { error: 'invalid' };
  }

  const now = new Date();
  const account = loginId ? await findAccountByLoginId(loginId) : null;
  const hash =
    account && !isLocked(account, now)
      ? (account.tempPasswordHash ?? account.passwordHash)
      : null;
  const passwordOk = await verifyPassword(password, hash);
  const outcome = evaluateLogin(
    account && {
      role: account.role,
      failedAttempts: account.failedAttempts,
      lockedUntil: account.lockedUntil,
      hasTempPassword: account.tempPasswordHash !== null,
    },
    passwordOk,
    now,
  );

  if (outcome.kind !== 'ok' || !account) {
    await recordLoginIpFailure(ipAddress);

    if (outcome.kind === 'failed' && account) {
      await recordAccountFailure(account.id, outcome.lockUntil);
    }

    return { error: outcome.kind === 'locked' ? 'locked' : 'invalid' };
  }

  await recordAccountSuccess(account.id, now);
  await startAdminSession(account.id);
  await logAdminAction({
    adminId: account.id,
    action: 'auth.login',
    targetType: 'admin_account',
    targetId: account.id,
  });

  return redirectToAdmin(
    key,
    outcome.next === 'password' ? 'password' : undefined,
  );
}

/**
 * 어드민 비밀번호 변경 (useActionState 용)
 * - 임시 비밀번호 단계(next === 'password')면 현재 비밀번호 없이, 콘솔에서 바꿀 때는 현재 비밀번호 확인
 * - 성공하면 임시 해시를 비우고 guest 는 viewer 로 올리며, 지금 세션을 뺀 이 계정의 세션을 모두 지움
 */
export async function changeAdminPassword(
  _prev: AdminPasswordState,
  formData: FormData,
): Promise<AdminPasswordState> {
  const session = await requireAdminPasswordStep();
  const key = requireAdminKey();
  const password = readField(formData, 'password');
  const confirm = readField(formData, 'confirm');
  const validation = validateNewPassword(session.loginId, password, confirm);

  if (validation !== 'ok') {
    return { error: validation };
  }

  const forced = session.next === 'password';

  if (!forced) {
    const [account] = await db
      .select({ passwordHash: adminAccount.passwordHash })
      .from(adminAccount)
      .where(eq(adminAccount.id, session.adminId))
      .limit(1);

    const currentOk = await verifyPassword(
      readField(formData, 'current'),
      account?.passwordHash ?? null,
    );

    if (!currentOk) {
      return { error: 'wrong_current' };
    }
  }

  const passwordHash = await hashPassword(password);
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(adminAccount)
      .set({
        passwordHash,
        tempPasswordHash: null,
        role: sql`case when ${adminAccount.role} = 'guest' then 'viewer' else ${adminAccount.role} end`,
        passwordChangedAt: now,
      })
      .where(eq(adminAccount.id, session.adminId));

    await tx
      .delete(adminSession)
      .where(
        and(
          eq(adminSession.adminId, session.adminId),
          ne(adminSession.id, session.sessionId),
        ),
      );
  });

  await logAdminAction({
    adminId: session.adminId,
    action: 'auth.password',
    targetType: 'admin_account',
    targetId: session.adminId,
    detail: { forced },
  });

  return redirectToAdmin(key);
}

// 어드민 로그아웃 (세션 행·쿠키 삭제 후 로그인 화면으로)
export async function logoutAdmin(): Promise<void> {
  const session = await requireAdminPasswordStep();
  const key = requireAdminKey();

  await endAdminSession(session.sessionId);
  await logAdminAction({
    adminId: session.adminId,
    action: 'auth.logout',
    targetType: 'admin_account',
    targetId: session.adminId,
  });

  return redirectToAdmin(key, 'login');
}
