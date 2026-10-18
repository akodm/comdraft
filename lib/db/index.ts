import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '@/lib/db/schema';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL 환경 변수가 설정되지 않았습니다.');
}

// 개발 환경의 HMR 로 모듈이 재평가될 때 커넥션 풀이 누적되지 않도록 전역에 보관
const globalForDb = globalThis as unknown as {
  postgresClient?: postgres.Sql;
};

// Supabase 트랜잭션 풀러(6543)는 prepared statement 를 지원하지 않으므로 비활성화
const client =
  globalForDb.postgresClient ??
  postgres(databaseUrl, { max: 10, prepare: false });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.postgresClient = client;
}

export const db = drizzle({ client, schema });

export type Database = typeof db;
