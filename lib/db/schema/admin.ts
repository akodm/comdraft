import {
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { comdraftSchema } from '@/lib/db/pg-schema';

/**
 * 어드민 콘솔 테이블 (서비스 사용자와 완전히 분리된 운영자 계정)
 * - 계정은 DB 에 직접 넣고, 비밀번호는 해시로만 저장
 * - 권한 등급은 ADMIN_ROLES 순서대로 높아짐 (guest 는 비밀번호 설정 전까지 아무것도 못 함)
 */

// 어드민 권한 등급
export const ADMIN_ROLES = ['guest', 'viewer', 'editor', 'admin'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

// 서비스 설정 키 (service_setting.key)
export const AI_GENERATION_SETTING_KEY = 'ai_generation';

// AI 작성 일시 중지 설정 (service_setting 의 ai_generation 값)
export interface AiGenerationSetting {
  paused: boolean;
  reason: string | null;
}

// 어드민 계정
export const adminAccount = comdraftSchema.table(
  'admin_account',
  {
    id: text('id').primaryKey(),
    // 로그인 아이디
    loginId: text('login_id').notNull().unique(),
    // 임시 비밀번호 해시 (첫 로그인 때 본인 비밀번호로 바꾸면 비움)
    tempPasswordHash: text('temp_password_hash'),
    // 본인 비밀번호 해시 (null 이면 아직 설정 전)
    passwordHash: text('password_hash'),
    role: text('role').$type<AdminRole>().default('guest').notNull(),
    // 연속 로그인 실패 횟수 (성공하면 0 으로)
    failedAttempts: integer('failed_attempts').default(0).notNull(),
    // 잠금 해제 시각 (이 시각 전에는 로그인 불가)
    lockedUntil: timestamp('locked_until', {
      withTimezone: true,
      precision: 3,
    }),
    // 마지막으로 본인 비밀번호를 정한 시각
    passwordChangedAt: timestamp('password_changed_at', {
      withTimezone: true,
      precision: 3,
    }),
    lastLoginAt: timestamp('last_login_at', {
      withTimezone: true,
      precision: 3,
    }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check(
      'admin_account_role_check',
      sql`${table.role} in ('guest', 'viewer', 'editor', 'admin')`,
    ),
  ],
);

// 어드민 로그인 세션 (쿠키에는 원문 토큰, DB 에는 해시만 저장)
export const adminSession = comdraftSchema.table('admin_session', {
  id: text('id').primaryKey(),
  adminId: text('admin_id')
    .notNull()
    .references(() => adminAccount.id, { onDelete: 'cascade' }),
  // 세션 토큰의 해시
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', {
    withTimezone: true,
    precision: 3,
  }).notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
    .defaultNow()
    .notNull(),
});

// 어드민 작업 기록 (누가 무엇을 바꿨는지, 계정을 지워도 기록은 남김)
export const adminActionLog = comdraftSchema.table(
  'admin_action_log',
  {
    id: text('id').primaryKey(),
    adminId: text('admin_id').references(() => adminAccount.id, {
      onDelete: 'set null',
    }),
    // 작업 종류 (예: user.ban, prompt.update)
    action: text('action').notNull(),
    // 대상 종류와 대상 id
    targetType: text('target_type').notNull(),
    targetId: text('target_id'),
    // 작업 상세 (비밀번호나 프롬프트 원문 같은 민감한 값은 넣지 않음)
    detail: jsonb('detail')
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('admin_action_log_created_at_idx').on(table.createdAt),
    index('admin_action_log_target_idx').on(table.targetType, table.targetId),
  ],
);

// 서비스 설정 (키마다 한 행, 값은 JSON)
export const serviceSetting = comdraftSchema.table('service_setting', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedBy: text('updated_by').references(() => adminAccount.id, {
    onDelete: 'set null',
  }),
  updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// 어드민이 수정한 AI 프롬프트 (없으면 aiPromptDefault 를 씀)
export const aiPrompt = comdraftSchema.table(
  'ai_prompt',
  {
    locale: text('locale').notNull(),
    key: text('key').notNull(),
    content: text('content').notNull(),
    updatedBy: text('updated_by').references(() => adminAccount.id, {
      onDelete: 'set null',
    }),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.locale, table.key] })],
);

// AI 프롬프트 수정 이력 (content 가 null 이면 기본값으로 되돌린 기록)
export const aiPromptRevision = comdraftSchema.table(
  'ai_prompt_revision',
  {
    id: text('id').primaryKey(),
    locale: text('locale').notNull(),
    key: text('key').notNull(),
    content: text('content'),
    adminId: text('admin_id').references(() => adminAccount.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('ai_prompt_revision_key_idx').on(
      table.locale,
      table.key,
      table.createdAt,
    ),
  ],
);

// 코드에 들어 있는 기본 프롬프트 (Lambda 가 배포 때 동기화, 어드민 화면의 기본값과 되돌리기 기준)
export const aiPromptDefault = comdraftSchema.table(
  'ai_prompt_default',
  {
    locale: text('locale').notNull(),
    key: text('key').notNull(),
    content: text('content').notNull(),
    // 프롬프트에 반드시 들어 있어야 하는 치환 표시 (없으면 저장 거부)
    requiredMarkers: text('required_markers').array().default([]).notNull(),
    // 기본값 버전 (코드가 바뀌었는지 비교용)
    version: text('version').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [primaryKey({ columns: [table.locale, table.key] })],
);
