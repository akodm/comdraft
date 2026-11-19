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
