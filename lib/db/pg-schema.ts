import { pgSchema } from 'drizzle-orm/pg-core';

/**
 * Supabase 프로젝트 하나를 여러 서비스가 공유하므로 public 대신 서비스 전용 스키마 사용
 *
 * - comdraft 스키마는 Supabase 에 이미 생성되어 있음
 * - drizzle-kit 은 schema 엔트리(lib/db/schema)에서 export 된 pgSchema 객체만 CREATE SCHEMA 로 생성하므로,
 *   이 객체는 lib/db/schema 밖에 두고 re-export 하지 않음 (테이블만 export)
 */
export const comdraftSchema = pgSchema('comdraft');
