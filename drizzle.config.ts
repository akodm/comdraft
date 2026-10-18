import { defineConfig } from 'drizzle-kit';

// env 파일은 package.json 의 db:* 스크립트에서 dotenv-cli 로 주입 (local: .env.development, prod: .env.production)
const migrationUrl = process.env.DATABASE_MIGRATION_URL;

if (!migrationUrl) {
  throw new Error('DATABASE_MIGRATION_URL 환경 변수가 설정되지 않았습니다.');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './lib/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: migrationUrl,
  },
  // 같은 Supabase DB 의 다른 프로젝트 스키마(public 포함)는 비교/변경 대상에서 제외
  schemaFilter: ['comdraft'],
  // 마이그레이션 이력 테이블도 기본값(drizzle 스키마) 대신 comdraft 스키마에 보관해 프로젝트 간 충돌 방지
  migrations: {
    schema: 'comdraft',
    table: '__drizzle_migrations',
  },
  strict: true,
  verbose: true,
});
