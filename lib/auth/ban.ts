import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { session, user } from '@/lib/db/schema';

/**
 * 서비스 사용자 이용 제한 (어드민이 user.banned_at 을 기록)
 * - 밴된 사용자는 새 세션을 만들 수 없고, 남은 세션은 페이지 접근 때 지움
 */

// 사용자가 이용 제한 상태인지 (없는 사용자는 false, 세션 생성 훅에서 씀)
export async function isUserBanned(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ bannedAt: user.bannedAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return Boolean(row?.bannedAt);
}

// 사용자의 서비스 세션을 모두 삭제 (쿠키 캐시가 꺼져 있어 바로 로그아웃됨)
export async function deleteUserSessions(userId: string): Promise<void> {
  await db.delete(session).where(eq(session.userId, userId));
}
