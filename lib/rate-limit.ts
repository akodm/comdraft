import 'server-only';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { rateLimit } from '@/lib/db/schema/auth';

/**
 * 키 하나의 시도 수를 1 올리고 올린 뒤의 수를 돌려줌 (Better Auth 와 같은 rate_limit 테이블을 키 접두사로 나눠 씀)
 * - 한 문장(INSERT … ON CONFLICT DO UPDATE … RETURNING)으로 올려 동시 요청도 빠지지 않고 셈
 * - 고정 창: lastRequest 는 창을 시작한 시각, 그 시각에서 windowMs 가 지나면 1 부터 다시 세고 창도 새로 시작
 *   → 창 안의 시도는 창을 늘리지 않음 (자동 저장처럼 계속 부르는 호출이 제한을 영원히 연장하지 않도록)
 *   → 두 SET 식 모두 갱신 전 행 값을 읽으므로 같은 조건으로 판단
 * - 어드민 로그인 실패 제한(lib/admin/login-limit.ts)은 의도적으로 마지막 시도 기준(슬라이딩)이라 따로 둠
 * - 한도를 넘었는지는 호출하는 쪽이 돌려받은 수로 판단 (먼저 올리고 비교)
 */
export async function incrementRateLimit(
  key: string,
  windowMs: number,
): Promise<number> {
  const now = Date.now();

  const windowExpired = sql`${now}::bigint - ${rateLimit.lastRequest} > ${windowMs}::bigint`;

  const [row] = await db
    .insert(rateLimit)
    .values({ id: crypto.randomUUID(), key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`case when ${windowExpired} then 1 else ${rateLimit.count} + 1 end`,
        lastRequest: sql`case when ${windowExpired} then ${now}::bigint else ${rateLimit.lastRequest} end`,
      },
    })
    .returning({ count: rateLimit.count });

  return row.count;
}
