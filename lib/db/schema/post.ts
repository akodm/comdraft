import { relations, sql } from 'drizzle-orm';
import { check, index, jsonb, text, timestamp } from 'drizzle-orm/pg-core';
import { comdraftSchema } from '@/lib/db/pg-schema';
import type { Locale } from '@/lib/i18n/config';
import { user } from '@/lib/db/schema/auth';
import { draft } from '@/lib/db/schema/draft';

/**
 * 게시글 테이블
 *
 * - post: 초안을 게시한 결과물 (게시할 때의 본문 스냅샷)
 *   → 초안마다 하나만 있고(draft_id unique), 다시 게시하면 같은 행을 갱신함
 *   → 초안이나 작성자가 삭제되면 함께 삭제됨
 */

// 게시글 공개 범위 ('공개' | '일부 공개')
export const POST_VISIBILITIES = ['public', 'unlisted'] as const;
export type PostVisibility = (typeof POST_VISIBILITIES)[number];

export const post = comdraftSchema.table(
  'post',
  {
    id: text('id').primaryKey(),
    draftId: text('draft_id')
      .notNull()
      .unique()
      .references(() => draft.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // 게시할 때 본문 첫 제목에서 뽑은 제목
    title: text('title').notNull(),
    // 제목에서 만든 slug (비어 있을 수 있음)
    slug: text('slug').notNull(),
    // 본문 첫 문단 요약 (피드 카드와 페이지 설명용)
    excerpt: text('excerpt').notNull(),
    // 정리를 거친 본문 스냅샷 (Tiptap 문서)
    content: jsonb('content').notNull(),
    visibility: text('visibility').$type<PostVisibility>().notNull(),
    // 게시할 때의 화면 언어 (대표 주소 언어, lib/i18n/config.ts 의 LOCALES)
    locale: text('locale').$type<Locale>().notNull(),
    // 처음 게시한 시각 (피드 정렬 기준, 다시 게시해도 바뀌지 않음)
    publishedAt: timestamp('published_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    // 마지막으로 다시 게시한 시각 (다시 게시할 때 명시적으로 설정)
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // 공개 피드 커서 조회: 공개 글만 게시 최신순
    index('post_public_published_idx')
      .on(table.publishedAt.desc(), table.id.desc())
      .where(sql`${table.visibility} = 'public'`),
    check(
      'post_visibility_check',
      sql`${table.visibility} in ('public', 'unlisted')`,
    ),
    check('post_locale_check', sql`${table.locale} in ('ko', 'en')`),
  ],
);

export const postRelations = relations(post, ({ one }) => ({
  draft: one(draft, {
    fields: [post.draftId],
    references: [draft.id],
  }),
  user: one(user, {
    fields: [post.userId],
    references: [user.id],
  }),
}));
