import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// server-only 는 서버 컴포넌트 밖에서 import 하면 던지므로 테스트에서는 비운다
vi.mock('server-only', () => ({}));

/**
 * rate_limit 행 하나를 흉내 내는 가짜 DB
 * - ON CONFLICT DO UPDATE 의 SET 식(SQL)을 그대로 풀어 이전 행 값으로 계산 (두 식 모두 이전 행을 읽음)
 */
interface Row {
  count: number;
  lastRequest: number;
}
const store: { row: Row | null } = { row: null };

// `case when A then B else C end` 와 `$n`, `::bigint`, 컬럼을 JS 식으로 바꿔 계산
const evaluate = (expression: SQL, previous: Row): number => {
  const { sql, params } = new PgDialect().sqlToQuery(expression);
  const js = sql
    .replace(/\$(\d+)/g, (_, index) => String(params[Number(index) - 1]))
    .replace(/::bigint/g, '')
    .replace(/("\w+"\.)*"last_request"/g, String(previous.lastRequest))
    .replace(/("\w+"\.)*"count"/g, String(previous.count))
    .replace(
      /case when (.+?) then (.+?) else (.+?) end/g,
      '(($1) ? ($2) : ($3))',
    );

  return Number(new Function(`return ${js};`)());
};

const builder = {
  insert: () => builder,
  values: (values: Row) => {
    pending.values = values;
    return builder;
  },
  onConflictDoUpdate: ({
    set,
  }: {
    set: { count: SQL; lastRequest: SQL | number };
  }) => {
    pending.set = set;
    return builder;
  },
  returning: async () => {
    const previous = store.row;
    const { values, set } = pending;

    store.row = previous
      ? {
          count: evaluate(set!.count, previous),
          lastRequest:
            typeof set!.lastRequest === 'number'
              ? set!.lastRequest
              : evaluate(set!.lastRequest, previous),
        }
      : { count: values!.count, lastRequest: values!.lastRequest };

    return [{ count: store.row.count }];
  },
};
const pending: {
  values?: Row;
  set?: { count: SQL; lastRequest: SQL | number };
} = {};
vi.mock('@/lib/db', () => ({ db: builder }));

const { incrementRateLimit } = await import('@/lib/rate-limit');

const WINDOW = 60 * 60 * 1000;
const START = Date.parse('2026-11-19T00:00:00.000Z');

describe('incrementRateLimit (고정 창)', () => {
  beforeEach(() => {
    store.row = null;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const attemptAt = (time: number) => {
    vi.setSystemTime(time);
    return incrementRateLimit('k', WINDOW);
  };

  it('창 안의 시도는 수만 올리고 창 시작 시각을 늦추지 않음', async () => {
    await expect(attemptAt(START)).resolves.toBe(1);
    await expect(attemptAt(START + 10 * 60 * 1000)).resolves.toBe(2);
    await expect(attemptAt(START + 50 * 60 * 1000)).resolves.toBe(3);

    expect(store.row?.lastRequest).toBe(START);
  });

  it('창 시작에서 창 길이가 지나면 계속 시도하고 있어도 1 부터 다시 셈', async () => {
    // 1시간 동안 쉬지 않고 시도 (자동 저장이 계속 주소 발급을 부르는 경우)
    for (let minute = 0; minute <= 60; minute += 5) {
      await attemptAt(START + minute * 60 * 1000);
    }

    await expect(attemptAt(START + WINDOW + 1)).resolves.toBe(1);
    expect(store.row?.lastRequest).toBe(START + WINDOW + 1);
    await expect(attemptAt(START + WINDOW + 2)).resolves.toBe(2);
  });
});
