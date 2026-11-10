import 'server-only';
import { count, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { image } from '@/lib/db/schema';
import { IMAGE_MAX_PER_DRAFT } from '@/lib/images/rules';

type NewImage = typeof image.$inferInsert & { draftId: string };

/**
 * 초안당 장 수 상한 안에서만 이미지 기록을 추가 (추가했으면 true, 상한이면 false)
 * - 같은 초안의 기록 추가를 초안 단위 advisory lock 으로 줄 세워, 동시에 마무리한 업로드가
 *   서로의 기록을 보지 못한 채 함께 통과해 상한을 넘는 일을 막음 (잠금은 트랜잭션이 끝나면 풀림)
 * - 같은 id 를 두 번 넣으면(같은 업로드를 동시에 마무리) 기본 키 충돌로 오류
 */
export const insertImageWithinLimit = async (
  values: NewImage,
  limit: number = IMAGE_MAX_PER_DRAFT,
): Promise<boolean> =>
  db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`image:${values.draftId}`}))`,
    );

    const [{ total }] = await tx
      .select({ total: count() })
      .from(image)
      .where(eq(image.draftId, values.draftId));

    if (total >= limit) {
      return false;
    }

    await tx.insert(image).values(values);

    return true;
  });
