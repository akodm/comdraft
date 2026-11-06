import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { comdraftSchema } from '@/lib/db/pg-schema';
import { user } from '@/lib/db/schema/auth';

/**
 * GitHub App 저장소 권한/추적 저장소 테이블
 * - 커밋 내역(메시지, 작성자 등)은 보안상 저장하지 않고, 필요할 때마다 GitHub API 로 조회 (lib/github/commits.ts)
 *
 * - github_installation: GitHub App 설치 정보 (사용자/조직 계정 단위)
 *   → 어떤 사용자가 어떤 설치에 접근 가능한지는 저장하지 않고,
 *     매번 사용자 토큰으로 GitHub(GET /user/installations)에 확인해 GitHub 권한을 그대로 따름
 * - github_repository: 설치를 통해 접근 가능한 저장소 중 추적(대시보드화) 대상으로 등록된 저장소
 * - user_repository: 사용자별 대시보드에 등록한 저장소와 추적할 브랜치
 */

export const githubInstallation = comdraftSchema.table('github_installation', {
  id: text('id').primaryKey(),
  installationId: bigint('installation_id', { mode: 'number' })
    .notNull()
    .unique(),
  accountId: bigint('account_id', { mode: 'number' }).notNull(),
  accountLogin: text('account_login').notNull(),
  // 'User' | 'Organization'
  accountType: text('account_type').notNull(),
  accountAvatarUrl: text('account_avatar_url'),
  // 'all' | 'selected'
  repositorySelection: text('repository_selection').notNull(),
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  installedByUserId: text('installed_by_user_id').references(() => user.id, {
    onDelete: 'set null',
  }),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const githubRepository = comdraftSchema.table(
  'github_repository',
  {
    id: text('id').primaryKey(),
    installationId: text('installation_id')
      .notNull()
      .references(() => githubInstallation.id, { onDelete: 'cascade' }),
    githubRepoId: bigint('github_repo_id', { mode: 'number' })
      .notNull()
      .unique(),
    ownerLogin: text('owner_login').notNull(),
    name: text('name').notNull(),
    fullName: text('full_name').notNull(),
    description: text('description'),
    isPrivate: boolean('is_private').notNull(),
    defaultBranch: text('default_branch').notNull(),
    htmlUrl: text('html_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('github_repository_installation_id_idx').on(table.installationId),
  ],
);

export const userRepository = comdraftSchema.table(
  'user_repository',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => githubRepository.id, { onDelete: 'cascade' }),
    branch: text('branch').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.repositoryId] }),
    index('user_repository_repository_id_idx').on(table.repositoryId),
  ],
);

export const githubInstallationRelations = relations(
  githubInstallation,
  ({ one, many }) => ({
    installedBy: one(user, {
      fields: [githubInstallation.installedByUserId],
      references: [user.id],
    }),
    repositories: many(githubRepository),
  }),
);

export const githubRepositoryRelations = relations(
  githubRepository,
  ({ one, many }) => ({
    installation: one(githubInstallation, {
      fields: [githubRepository.installationId],
      references: [githubInstallation.id],
    }),
    users: many(userRepository),
  }),
);

export const userRepositoryRelations = relations(userRepository, ({ one }) => ({
  user: one(user, {
    fields: [userRepository.userId],
    references: [user.id],
  }),
  repository: one(githubRepository, {
    fields: [userRepository.repositoryId],
    references: [githubRepository.id],
  }),
}));
