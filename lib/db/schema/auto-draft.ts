import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import type { GenerationModel } from '@/lib/generation/contract';
import { comdraftSchema } from '@/lib/db/pg-schema';
import { userRepository } from '@/lib/db/schema/github';

/**
 * 커밋 트리거 자동 초안 테이블
 *
 * - repository_auto_draft: 사용자 + 저장소별 자동 초안 설정 (켜기 여부, 요청 문구, 기본 옵션, 경계 SHA)
 *   → 저장소 연동을 해제하면 설정도 함께 삭제됨
 *   → 옵션 기본값은 lib/studio/options.ts 의 DEFAULT_PROMPT_OPTIONS 와 같되 length 만 short
 *     (스키마가 Lingui 매크로를 끌어오지 않도록 리터럴로 둠)
 * - repository_excluded_commit: 자동 초안 대상에서 제외한 커밋 SHA (SHA 만 저장, 메시지는 저장하지 않음)
 */

// 제외 사유 (user: 사용자가 직접 제외, force_push: 강제 푸시로 사라진 커밋)
export const EXCLUDED_COMMIT_REASONS = ['user', 'force_push'] as const;
export type ExcludedCommitReason = (typeof EXCLUDED_COMMIT_REASONS)[number];

export const repositoryAutoDraft = comdraftSchema.table(
  'repository_auto_draft',
  {
    userId: text('user_id').notNull(),
    repositoryId: text('repository_id').notNull(),
    enabled: boolean('enabled').default(false).notNull(),
    // 자동 초안 요청에 쓰는 기본 요청 문구
    prompt: text('prompt').default('').notNull(),
    // 기본 옵션 값 (lib/studio/options.ts 의 키)
    tone: text('tone').default('plain').notNull(),
    postType: text('post_type').default('experience').notNull(),
    length: text('length').default('short').notNull(),
    requiredBlocks: text('required_blocks')
      .array()
      .default(['h2', 'list', 'code'])
      .notNull(),
    model: text('model').$type<GenerationModel>().default('haiku').notNull(),
    // 이 SHA 까지의 커밋은 자동 초안 대상에서 제외 (null 이면 제한 없음)
    boundarySha: text('boundary_sha'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.repositoryId] }),
    foreignKey({
      name: 'repository_auto_draft_user_repository_fk',
      columns: [table.userId, table.repositoryId],
      foreignColumns: [userRepository.userId, userRepository.repositoryId],
    }).onDelete('cascade'),
  ],
);

export const repositoryExcludedCommit = comdraftSchema.table(
  'repository_excluded_commit',
  {
    userId: text('user_id').notNull(),
    repositoryId: text('repository_id').notNull(),
    sha: text('sha').notNull(),
    reason: text('reason').$type<ExcludedCommitReason>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.repositoryId, table.sha] }),
    foreignKey({
      name: 'repository_excluded_commit_user_repository_fk',
      columns: [table.userId, table.repositoryId],
      foreignColumns: [userRepository.userId, userRepository.repositoryId],
    }).onDelete('cascade'),
    check(
      'repository_excluded_commit_reason_check',
      sql`${table.reason} in ('user', 'force_push')`,
    ),
  ],
);
