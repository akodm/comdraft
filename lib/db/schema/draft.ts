import { relations } from 'drizzle-orm';
import {
  foreignKey,
  index,
  jsonb,
  text,
  timestamp,
  unique,
} from 'drizzle-orm/pg-core';
import { comdraftSchema } from '@/lib/db/pg-schema';
import { user } from '@/lib/db/schema/auth';
import { githubRepository, userRepository } from '@/lib/db/schema/github';

/**
 * 초안 작성 스튜디오 테이블
 *
 * - draft: 사용자가 연동한 저장소별 기술 블로그 초안 (스튜디오 왼쪽 사이드바의 한 항목)
 *   → (user_id, repository_id) 가 user_repository 를 참조하므로 연동한 저장소에만 만들 수 있고,
 *     저장소 연동을 해제하면 그 저장소의 초안도 함께 삭제됨
 * - draft_prompt: 초안에 보낸 작성 요청 기록 (요청 문구 + 기본 옵션 + 선택한 커밋)
 *   → 커밋 내용(메시지/작성자 등)은 저장하지 않고 SHA 만 남김, 내용은 필요할 때 GitHub API 로 조회
 * - draft_reference_link: 초안의 작성 요청에 함께 쓰는 참고 링크 (초안마다 따로 관리)
 *   → 주소만 저장하고 서버에서 링크를 열어 보지 않음 (SSRF 방지)
 */

// 사이드바에 표시하는 초안 상태 ('초안' | '임시' | '게시')
export const DRAFT_STATUSES = ['draft', 'temporary', 'published'] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

// 게시한 초안의 공개 범위 ('공개' | '일부 공개' | '비공개'), 게시 전에는 null
export const DRAFT_VISIBILITIES = ['public', 'unlisted', 'private'] as const;
export type DraftVisibility = (typeof DRAFT_VISIBILITIES)[number];

export const draft = comdraftSchema.table(
  'draft',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    repositoryId: text('repository_id').notNull(),
    // 본문 첫 제목에서 뽑은 목록 표시용 제목 (본문이 비어 있으면 빈 문자열)
    title: text('title').default('').notNull(),
    // Tiptap 문서(JSON). 아직 작성 요청을 보내지 않은 초안은 null
    content: jsonb('content'),
    status: text('status').$type<DraftStatus>().default('draft').notNull(),
    visibility: text('visibility').$type<DraftVisibility>(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    foreignKey({
      name: 'draft_user_repository_fk',
      columns: [table.userId, table.repositoryId],
      foreignColumns: [userRepository.userId, userRepository.repositoryId],
    }).onDelete('cascade'),
    // 스튜디오 초안 목록 / 대시보드 초안 개수: 사용자 + 저장소별 최근 수정순
    index('draft_user_repository_updated_idx').on(
      table.userId,
      table.repositoryId,
      table.updatedAt.desc(),
    ),
  ],
);

export const draftPrompt = comdraftSchema.table(
  'draft_prompt',
  {
    id: text('id').primaryKey(),
    draftId: text('draft_id')
      .notNull()
      .references(() => draft.id, { onDelete: 'cascade' }),
    prompt: text('prompt').notNull(),
    // 기본 옵션 값 (lib/studio/options.ts 의 키)
    tone: text('tone').notNull(),
    postType: text('post_type').notNull(),
    length: text('length').notNull(),
    requiredBlocks: text('required_blocks').array().default([]).notNull(),
    // 요청에 사용한 커밋 SHA (최신순)
    commitShas: text('commit_shas').array().default([]).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('draft_prompt_draft_created_idx').on(
      table.draftId,
      table.createdAt.desc(),
    ),
  ],
);

export const draftReferenceLink = comdraftSchema.table(
  'draft_reference_link',
  {
    id: text('id').primaryKey(),
    draftId: text('draft_id')
      .notNull()
      .references(() => draft.id, { onDelete: 'cascade' }),
    // 검증을 거친 http/https 주소 (lib/studio/reference-link.ts)
    url: text('url').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // 같은 초안에 같은 주소는 한 번만 (초안별 목록 조회도 이 인덱스 사용)
    unique('draft_reference_link_draft_url_unique').on(
      table.draftId,
      table.url,
    ),
  ],
);

export const draftRelations = relations(draft, ({ one, many }) => ({
  user: one(user, {
    fields: [draft.userId],
    references: [user.id],
  }),
  repository: one(githubRepository, {
    fields: [draft.repositoryId],
    references: [githubRepository.id],
  }),
  prompts: many(draftPrompt),
  referenceLinks: many(draftReferenceLink),
}));

export const draftPromptRelations = relations(draftPrompt, ({ one }) => ({
  draft: one(draft, {
    fields: [draftPrompt.draftId],
    references: [draft.id],
  }),
}));

export const draftReferenceLinkRelations = relations(
  draftReferenceLink,
  ({ one }) => ({
    draft: one(draft, {
      fields: [draftReferenceLink.draftId],
      references: [draft.id],
    }),
  }),
);
