import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/db/schema/auth';

/**
 * 키 하나의 시도 수를 1 올리고 올린 뒤의 수를 돌려줌 (Better Auth 와 같은 rate_limit 테이블을 키 접두사로 나눠 씀)
 * - 한 문장(INSERT … ON CONFLICT DO UPDATE … RETURNING)으로 올려 동시 요청도 빠지지 않고 셈
 * - lastRequest 는 마지막 시도 시각, 창(windowMs)이 지나면 1 부터 다시 셈
 * - 한도를 넘었는지는 호출하는 쪽이 돌려받은 수로 판단 (먼저 올리고 비교)
 */
export async function incrementRateLimit(
  key: string,
  windowMs: number,
): Promise<number> {
  const now = Date.now();

  const [row] = await db
    .insert(rateLimit)
    .values({ id: crypto.randomUUID(), key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${now}::bigint - ${rateLimit.lastRequest} > ${windowMs}::bigint then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: now,
      },
    })
    .returning({ count: rateLimit.count });

  return row.count;
}
