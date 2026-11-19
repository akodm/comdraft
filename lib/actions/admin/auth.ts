'use server';

import { and, eq, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { adminAccount, adminSession } from '@/lib/db/schema/admin';
import { logAdminAction } from '@/lib/admin/audit';
import {
  redirectToAdmin,
  requireAdminKey,
  requireAdminPasswordStep,
} from '@/lib/admin/guard';
import {
  classifyUnreserved,
  evaluateLogin,
  isIpOverLimit,
  lockUntilFrom,
  type LoginReservation,
  MAX_FAILED_ATTEMPTS,
} from '@/lib/admin/login';
import {
  releaseLoginIpAttempt,
  reserveLoginIpAttempt,
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

interface AccountAttempt {
  reservation: LoginReservation;
  adminId: string | null;
  // 비교할 해시 (임시 비밀번호가 있으면 임시 해시, 예약되지 않았으면 null → 더미 비교)
  hash: string | null;
}

const UNKNOWN_ATTEMPT: AccountAttempt = {
  reservation: { kind: 'unknown' },
  adminId: null,
  hash: null,
};

const readField = (formData: FormData, name: string): string => {
  const value = formData.get(name);

  return typeof value === 'string' ? value : '';
};

/**
 * 비밀번호 비교 전에 이번 시도를 실패로 미리 셈
 * - 잠금 중인 계정은 행이 걸리지 않아 올리지 않음 (그때는 다시 읽어 잠금인지 없는 계정인지 구분)
 * - MAX_FAILED_ATTEMPTS 번째가 되는 순간 같은 문장에서 잠금 시각도 저장해 동시 요청이 잠금을 건너뛰지 못함
 */
const reserveAccountAttempt = async (
  loginId: string,
  now: Date,
): Promise<AccountAttempt> => {
  const [row] = await db
    .update(adminAccount)
    .set({
      failedAttempts: sql`${adminAccount.failedAttempts} + 1`,
      lockedUntil: sql`case when ${adminAccount.failedAttempts} + 1 >= ${MAX_FAILED_ATTEMPTS} then ${lockUntilFrom(now).toISOString()}::timestamptz else ${adminAccount.lockedUntil} end`,
    })
    .where(
      and(
        eq(adminAccount.loginId, loginId),
        or(
          isNull(adminAccount.lockedUntil),
          lte(adminAccount.lockedUntil, now),
        ),
      ),
    )
    .returning({
      id: adminAccount.id,
      role: adminAccount.role,
      attempts: adminAccount.failedAttempts,
      lockedUntil: adminAccount.lockedUntil,
      tempPasswordHash: adminAccount.tempPasswordHash,
      passwordHash: adminAccount.passwordHash,
    });

  if (row) {
    return {
      reservation: {
        kind: 'reserved',
        role: row.role,
        attempts: row.attempts,
        lockedUntil: row.lockedUntil,
        hasTempPassword: row.tempPasswordHash !== null,
      },
      adminId: row.id,
      hash: row.tempPasswordHash ?? row.passwordHash,
    };
  }

  const [existing] = await db
    .select({ lockedUntil: adminAccount.lockedUntil })
    .from(adminAccount)
    .where(eq(adminAccount.loginId, loginId))
    .limit(1);

  return {
    ...UNKNOWN_ATTEMPT,
    reservation: classifyUnreserved(existing ?? null, now),
  };
};

// 로그인 성공: 미리 센 실패와 잠금을 지우고 마지막 로그인 시각 저장
const recordAccountSuccess = async (adminId: string, now: Date) => {
  await db
    .update(adminAccount)
    .set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: now })
    .where(eq(adminAccount.id, adminId));
};

/**
 * 어드민 로그인 (useActionState 용)
 * 1. IP 실패 수를 먼저 올리고, 한도를 넘었으면 실제 비교 없이 거부 (더미 비교로 응답 시간은 맞춤)
 * 2. 계정 실패 수를 먼저 올린 뒤 비교 (계정이 없거나 잠금 중이면 더미 비교)
 * 3. 성공하면 미리 센 실패를 되돌리고 세션을 만든 뒤 콘솔 또는 비밀번호 변경 화면으로 이동
 */
export async function loginAdmin(
  _prev: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const key = requireAdminKey();
  const loginId = readField(formData, 'loginId').trim();
  const password = readField(formData, 'password');
  const { ipAddress } = await getAdminClientInfo();

  if (isIpOverLimit(await reserveLoginIpAttempt(ipAddress))) {
    await verifyPassword(password, null);

    return { error: 'invalid' };
  }

  const now = new Date();
  const attempt = loginId
    ? await reserveAccountAttempt(loginId, now)
    : UNKNOWN_ATTEMPT;
  const passwordOk = await verifyPassword(password, attempt.hash);
  const outcome = evaluateLogin(attempt.reservation, passwordOk);

  if (outcome.kind !== 'ok' || attempt.adminId === null) {
    return { error: outcome.kind === 'locked' ? 'locked' : 'invalid' };
  }

  const adminId = attempt.adminId;

  await recordAccountSuccess(adminId, now);
  await releaseLoginIpAttempt(ipAddress);
  await startAdminSession(adminId);
  await logAdminAction({
    adminId,
    action: 'auth.login',
    targetType: 'admin_account',
    targetId: adminId,
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
