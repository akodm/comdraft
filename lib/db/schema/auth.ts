import { relations } from 'drizzle-orm';
import { boolean, index, text, timestamp } from 'drizzle-orm/pg-core';
import { comdraftSchema } from '@/lib/db/pg-schema';

/**
 * Better Auth 코어 테이블 (GitHub 회원가입/로그인 전용)
 * - TS 프로퍼티명은 Better Auth 필드명(camelCase)과 일치해야 어댑터가 매핑할 수 있음
 * - 실제 컬럼명은 snake_case 로 저장
 * - 모든 테이블은 comdraft 스키마에 생성 (public 미사용)
 * - 저장소 권한(GitHub App 설치) 관련 테이블은 별도 스키마 파일로 추가 예정
 */

export const user = comdraftSchema.table('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// 로그인 세션 (DB 저장형 세션, 쿠키에는 불투명 토큰만 저장)
export const session = comdraftSchema.table(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  (table) => [index('session_user_id_idx').on(table.userId)],
);

// GitHub OAuth 계정 연결 정보 (accountId = GitHub user id, providerId = 'github')
export const account = comdraftSchema.table(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    // 이메일/비밀번호 로그인은 쓰지 않지만 Better Auth 코어 account 모델 필드라 유지 (항상 null)
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('account_user_id_idx').on(table.userId)],
);

// OAuth state 등 일회성 검증 값 저장 (GitHub 로그인 시 CSRF 방지용 state 보관)
export const verification = comdraftSchema.table(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index('verification_identifier_idx').on(table.identifier)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
