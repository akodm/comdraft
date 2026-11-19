import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { countSince } from '@/lib/admin/stats-sql';
import { user } from '@/lib/db/schema/auth';
import { post } from '@/lib/db/schema/post';

describe('countSince', () => {
  it.each([
    ['user.createdAt', user.createdAt],
    ['post.publishedAt', post.publishedAt],
  ])('%s: 바인딩 값에 Date 가 없음', (_name, column) => {
    const since = new Date('2026-11-16T00:00:00.000Z');
    const { sql: text, params } = new PgDialect().sqlToQuery(
      countSince(column, since),
    );

    expect(text).toContain('filter (where');
    expect(params.some((param) => param instanceof Date)).toBe(false);
    expect(params).toHaveLength(1);
  });
});
