import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/db/schema/auth';
import { IP_FAILURE_WINDOW_MS, isIpBlocked } from '@/lib/admin/login';

/**
 * IP 단위 어드민 로그인 실패 수 (Better Auth 와 같은 rate_limit 테이블을 키 접두사로 나눠 씀)
 * - lastRequest 는 마지막 실패 시각, 창(1시간)이 지나면 1 부터 다시 셈
 */
const ipKey = (ip: string) => `admin-login:${ip}`;

export async function isLoginIpBlocked(ip: string): Promise<boolean> {
  const [row] = await db
    .select({ count: rateLimit.count, lastRequest: rateLimit.lastRequest })
    .from(rateLimit)
    .where(eq(rateLimit.key, ipKey(ip)))
    .limit(1);

  return isIpBlocked(row ?? null, Date.now());
}

// 실패 1회 기록 (동시에 실패해도 수가 빠지지 않도록 한 문장으로 올림)
export async function recordLoginIpFailure(ip: string): Promise<void> {
  const now = Date.now();

  await db
    .insert(rateLimit)
    .values({
      id: crypto.randomUUID(),
      key: ipKey(ip),
      count: 1,
      lastRequest: now,
    })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${now}::bigint - ${rateLimit.lastRequest} > ${IP_FAILURE_WINDOW_MS}::bigint then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: now,
      },
    });
}
