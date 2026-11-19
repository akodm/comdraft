import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';

// server-only 는 서버 컴포넌트 밖에서 import 하면 던지므로 테스트에서는 비운다
vi.mock('server-only', () => ({}));

// where 에 넘긴 조건만 붙잡는 가짜 쿼리 빌더 (DB 연결 없음)
const captured: { where?: SQL } = {};
const builder: Record<string, unknown> = {};
for (const method of ['select', 'from', 'innerJoin', 'orderBy']) {
  builder[method] = () => builder;
}
builder.where = (condition: SQL) => {
  captured.where = condition;
  return builder;
};
builder.limit = async () => [];
vi.mock('@/lib/db', () => ({ db: builder }));

const jobs = await import('@/lib/generation/jobs');
const toSql = (condition: SQL) => new PgDialect().sqlToQuery(condition).sql;

describe('visibleToUser', () => {
  it('숨긴(deleted_at 이 있는) 행을 제외', () =>
    expect(toSql(jobs.visibleToUser)).toContain('"deleted_at" is null'));
});

describe('사용자 화면 조회', () => {
  it.each([
    ['getLatestDraftJobOptions', () => jobs.getLatestDraftJobOptions('d1')],
    ['getLatestDraftJob', () => jobs.getLatestDraftJob('d1')],
    ['getUserJob', () => jobs.getUserJob('u1', 'j1')],
    ['getFillJobParagraphs', () => jobs.getFillJobParagraphs('j1')],
  ])('%s 는 숨긴 행을 건너뜀', async (_name, run) => {
    captured.where = undefined;
    await run();
    expect(toSql(captured.where!)).toContain('"deleted_at" is null');
  });
});

// 실행 순서대로 SQL 과 값을 붙잡는 가짜 트랜잭션
// - count 결과는 totals 에서 차례로, UPDATE … RETURNING 은 updated 행을 돌려줌
const setupTx = (totals: number[], updated: unknown[] = []) => {
  const calls: Array<{ kind: string; sql: string; params: unknown[] }> = [];
  const record = (kind: string, query: SQL) => {
    const { sql, params } = new PgDialect().sqlToQuery(query);
    calls.push({ kind, sql, params });
  };
  const tx = {
    execute: async (query: SQL) => {
      record('execute', query);
      return [];
    },
    select: () => {
      const chain = {
        from: () => chain,
        where: async (condition: SQL) => {
          record('count', condition);
          return [{ total: totals.shift() ?? 0 }];
        },
      };
      return chain;
    },
    update: () => {
      const chain = {
        set: () => chain,
        where: (condition: SQL) => {
          record('update', condition);
          return chain;
        },
        returning: async () => updated,
      };
      return chain;
    },
  };

  return { tx, calls };
};

// 잠금과 진행 중 수 확인 (모든 작업 생성·재개 공통)
const expectLockThenActiveCount = (
  calls: ReturnType<typeof setupTx>['calls'],
) => {
  expect(calls[0].kind).toBe('execute');
  expect(calls[0].sql).toContain('pg_advisory_xact_lock(hashtext(');
  expect(calls[0].params).toEqual(['generation:u1']);
  expect(calls[1].kind).toBe('count');
  // 진행 중은 queued·running 만 (답변 대기는 Lambda 를 쓰지 않으므로 세지 않음)
  expect(calls[1].sql).toContain('"status" in');
  expect(calls[1].params).toEqual(['u1', 'queued', 'running']);
};

describe('reserveGenerationSlot', () => {
  it('사용자 단위 advisory lock 을 먼저 잡은 뒤 진행 중 수와 시간당 수를 셈', async () => {
    const { tx, calls } = setupTx([1, 3]);

    await expect(jobs.reserveGenerationSlot(tx as never, 'u1')).resolves.toBe(
      'ok',
    );

    expect(calls.map(({ kind }) => kind)).toEqual([
      'execute',
      'count',
      'count',
    ]);
    expectLockThenActiveCount(calls);
    expect(calls[2].sql).toContain('"created_at" >=');
  });

  it('진행 중 작업이 2개면 too_many_active', async () => {
    const { tx } = setupTx([2, 2]);

    await expect(jobs.reserveGenerationSlot(tx as never, 'u1')).resolves.toBe(
      'too_many_active',
    );
  });

  it('시간당 요청 수가 한도면 rate_limited', async () => {
    const { tx } = setupTx([0, 20]);

    await expect(jobs.reserveGenerationSlot(tx as never, 'u1')).resolves.toBe(
      'rate_limited',
    );
  });
});

describe('requeueAwaitingJob', () => {
  const requeue = (tx: ReturnType<typeof setupTx>['tx']) => {
    builder.transaction = async (run: (inner: unknown) => unknown) => run(tx);
    return jobs.requeueAwaitingJob('j1', 'u1', 'skipped');
  };

  it('같은 사용자 잠금을 잡고 진행 중 수를 센 뒤 답변 대기 → queued', async () => {
    const { tx, calls } = setupTx([1], [{ id: 'j1' }]);

    await expect(requeue(tx)).resolves.toBe('requeued');

    expect(calls.map(({ kind }) => kind)).toEqual([
      'execute',
      'count',
      'update',
    ]);
    expectLockThenActiveCount(calls);
    expect(calls[2].params).toContain('awaiting_input');
  });

  it('진행 중 작업이 2개면 다시 넣지 않고 too_many_active (답변 대기 그대로)', async () => {
    const { tx, calls } = setupTx([2], [{ id: 'j1' }]);

    await expect(requeue(tx)).resolves.toBe('too_many_active');
    expect(calls.some(({ kind }) => kind === 'update')).toBe(false);
  });

  it('다른 탭이 먼저 처리했으면 not_found', async () => {
    const { tx } = setupTx([0], []);

    await expect(requeue(tx)).resolves.toBe('not_found');
  });
});
