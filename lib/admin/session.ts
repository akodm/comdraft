import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  adminAccount,
  adminSession,
  type AdminRole,
} from '@/lib/db/schema/admin';
import { canEnter } from '@/lib/admin/roles';
import { createSessionToken, hashSessionToken } from '@/lib/admin/token';

/**
 * 어드민 세션 (서비스 사용자 세션과 별개)
 * - 쿠키에는 원문 토큰, DB 에는 SHA-256 해시만 저장
 * - 로그인 후 12시간이면 만료 (연장 없음)
 */
export const ADMIN_SESSION_COOKIE = 'comdraft_admin';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

// user-agent 는 기록용이라 지나치게 긴 값은 자름
const MAX_USER_AGENT_LENGTH = 512;

export interface AdminSessionContext {
  sessionId: string;
  adminId: string;
  loginId: string;
  role: AdminRole;
  // 콘솔로 들어갈 수 있는지, 임시 비밀번호 변경 화면만 가능한지
  next: 'console' | 'password';
}

// 요청한 클라이언트의 IP 와 user-agent
export async function getAdminClientInfo(): Promise<{
  ipAddress: string;
  userAgent: string | null;
}> {
  const headerList = await headers();
  const forwarded = headerList.get('x-forwarded-for')?.split(',')[0]?.trim();
  const realIp = headerList.get('x-real-ip')?.trim();
  const userAgent = headerList.get('user-agent');

  return {
    ipAddress: forwarded || realIp || 'unknown',
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
  };
}

// 쿠키의 토큰으로 세션을 DB 기준으로 확인 (같은 요청 안에서는 한 번만 조회)
export const getAdminSession = cache(
  async (): Promise<AdminSessionContext | null> => {
    const token = (await cookies()).get(ADMIN_SESSION_COOKIE)?.value;

    if (!token) {
      return null;
    }

    const [row] = await db
      .select({
        sessionId: adminSession.id,
        expiresAt: adminSession.expiresAt,
        adminId: adminAccount.id,
        loginId: adminAccount.loginId,
        role: adminAccount.role,
        tempPasswordHash: adminAccount.tempPasswordHash,
      })
      .from(adminSession)
      .innerJoin(adminAccount, eq(adminAccount.id, adminSession.adminId))
      .where(eq(adminSession.tokenHash, hashSessionToken(token)))
      .limit(1);

    if (!row) {
      return null;
    }

    const next = canEnter(row.role, row.tempPasswordHash !== null);

    // 만료됐거나 더 이상 들어올 수 없는 권한이면 세션 행을 지움 (쿠키는 렌더 중 지울 수 없어 그대로 둠)
    if (row.expiresAt.getTime() <= Date.now() || next === 'denied') {
      await db.delete(adminSession).where(eq(adminSession.id, row.sessionId));

      return null;
    }

    return {
      sessionId: row.sessionId,
      adminId: row.adminId,
      loginId: row.loginId,
      role: row.role,
      next,
    };
  },
);

// 새 세션 행을 만들고 쿠키를 심음 (Server Action 전용)
export async function startAdminSession(adminId: string): Promise<void> {
  const { token, tokenHash } = createSessionToken();
  const { ipAddress, userAgent } = await getAdminClientInfo();

  await db.insert(adminSession).values({
    id: crypto.randomUUID(),
    adminId,
    tokenHash,
    expiresAt: new Date(Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000),
    ipAddress,
    userAgent,
  });

  (await cookies()).set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
}

// 세션 행과 쿠키를 지움 (Server Action 전용)
export async function endAdminSession(sessionId: string): Promise<void> {
  await db.delete(adminSession).where(eq(adminSession.id, sessionId));
  (await cookies()).delete(ADMIN_SESSION_COOKIE);
}
