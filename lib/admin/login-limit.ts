import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/db/schema/auth';
import { IP_FAILURE_WINDOW_MS } from '@/lib/admin/login';

/**
 * IP 단위 어드민 로그인 실패 수 (Better Auth 와 같은 rate_limit 테이블을 키 접두사로 나눠 씀)
 * - 비밀번호 비교 전에 먼저 1 올려 두고(예약), 성공하면 1 되돌림 → 동시 요청도 한도를 넘지 못함
 * - lastRequest 는 마지막 시도 시각, 창(1시간)이 지나면 1 부터 다시 셈
 */
const ipKey = (ip: string) => `admin-login:${ip}`;

// 이번 시도를 실패로 미리 세고, 올린 뒤의 수를 돌려줌 (한 문장으로 올려 동시 요청에도 빠지지 않음)
export async function reserveLoginIpAttempt(ip: string): Promise<number> {
  const now = Date.now();

  const [row] = await db
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
    })
    .returning({ count: rateLimit.count });

  return row.count;
}

// 로그인에 성공하면 미리 센 1회를 되돌림 (그동안의 실패 수는 지우지 않음)
export async function releaseLoginIpAttempt(ip: string): Promise<void> {
  await db
    .update(rateLimit)
    .set({ count: sql`greatest(${rateLimit.count} - 1, 0)` })
    .where(eq(rateLimit.key, ipKey(ip)));
}
