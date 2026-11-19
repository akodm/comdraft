import { gte, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';

/**
 * 기준 시각 이후 행 수 (집계용)
 * - Date 를 raw sql 에 직접 넣으면 postgres-js 가 직렬화하지 못하므로, 컬럼 타입을 거치는 gte 로 만듦
 */
export const countSince = (column: PgColumn, since: Date): SQL<number> =>
  sql<number>`count(*) filter (where ${gte(column, since)})`.mapWith(Number);
