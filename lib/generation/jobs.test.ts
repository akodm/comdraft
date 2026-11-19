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

describe('reserveGenerationSlot', () => {
  // 실행 순서대로 SQL 과 값을 붙잡는 가짜 트랜잭션 (count 결과는 차례로 돌려줌)
  const setup = (totals: number[]) => {
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
    };

    return { tx, calls };
  };

  it('사용자 단위 advisory lock 을 먼저 잡은 뒤 시간당 수와 진행 중 수를 셈', async () => {
    const { tx, calls } = setup([3, 1]);

    await expect(jobs.reserveGenerationSlot(tx as never, 'u1')).resolves.toBe(
      'ok',
    );

    expect(calls.map(({ kind }) => kind)).toEqual([
      'execute',
      'count',
      'count',
    ]);
    expect(calls[0].sql).toContain('pg_advisory_xact_lock(hashtext(');
    expect(calls[0].params).toEqual(['generation:u1']);
    expect(calls[1].sql).toContain('"created_at" >=');
    // 진행 중은 queued·running 만 (답변 대기는 Lambda 를 쓰지 않으므로 세지 않음)
    expect(calls[2].sql).toContain('"status" in');
    expect(calls[2].params).toEqual(['u1', 'queued', 'running']);
  });

  it('진행 중 작업이 2개면 too_many_active', async () => {
    const { tx } = setup([2, 2]);

    await expect(jobs.reserveGenerationSlot(tx as never, 'u1')).resolves.toBe(
      'too_many_active',
    );
  });

  it('시간당 요청 수가 한도면 rate_limited', async () => {
    const { tx } = setup([20, 0]);

    await expect(jobs.reserveGenerationSlot(tx as never, 'u1')).resolves.toBe(
      'rate_limited',
    );
  });
});
