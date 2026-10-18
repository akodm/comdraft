import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  primaryKey,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { comdraftSchema } from '@/lib/db/pg-schema';
import { user } from '@/lib/db/schema/auth';

/**
 * GitHub App 저장소 권한/커밋 대시보드 테이블
 *
 * - github_installation: GitHub App 설치 정보 (사용자/조직 계정 단위)
 *   → 어떤 사용자가 어떤 설치에 접근 가능한지는 저장하지 않고,
 *     매번 사용자 토큰으로 GitHub(GET /user/installations)에 확인해 GitHub 권한을 그대로 따름
 * - github_repository: 설치를 통해 접근 가능한 저장소 중 추적(대시보드화) 대상으로 등록된 저장소
 * - user_repository: 사용자별 대시보드에 등록한 저장소 (같은 저장소를 여러 사용자가 등록해도 커밋은 한 번만 저장)
 * - github_commit: 동기화된 커밋 내역
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
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    lastSyncError: text('last_sync_error'),
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
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.repositoryId] }),
    index('user_repository_repository_id_idx').on(table.repositoryId),
  ],
);

export const githubCommit = comdraftSchema.table(
  'github_commit',
  {
    id: text('id').primaryKey(),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => githubRepository.id, { onDelete: 'cascade' }),
    sha: text('sha').notNull(),
    message: text('message').notNull(),
    authorName: text('author_name'),
    authorEmail: text('author_email'),
    // GitHub 계정과 연결되지 않은 커밋(이메일 미등록 등)은 null
    authorLogin: text('author_login'),
    authorAvatarUrl: text('author_avatar_url'),
    authoredAt: timestamp('authored_at', { withTimezone: true }),
    committedAt: timestamp('committed_at', { withTimezone: true }).notNull(),
    htmlUrl: text('html_url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique('github_commit_repository_id_sha_unique').on(
      table.repositoryId,
      table.sha,
    ),
    index('github_commit_repository_id_committed_at_idx').on(
      table.repositoryId,
      table.committedAt,
    ),
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
    commits: many(githubCommit),
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

export const githubCommitRelations = relations(githubCommit, ({ one }) => ({
  repository: one(githubRepository, {
    fields: [githubCommit.repositoryId],
    references: [githubRepository.id],
  }),
}));
