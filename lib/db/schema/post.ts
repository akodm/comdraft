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
    // 기술 태그 (게시할 때 초안 태그를 복사, 나중 목록 필터와 SEO 용으로 지금은 수집만)
    tags: text('tags').array().default([]).notNull(),
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
    // 나중 태그 필터용 (tags @> '{nextjs}')
    index('post_tags_idx').using('gin', table.tags),
    check(
      'post_visibility_check',
      sql`${table.visibility} in ('public', 'unlisted')`,
    ),
    check('post_locale_check', sql`${table.locale} in ('ko', 'en')`),
  ],
);

/**
 * 게시글 조회 기록
 *
 * - post_view: 센 조회만 한 줄씩 (같은 글 같은 사람은 30일에 한 번, 글쓴이 본인 제외)
 *   → 화면에 표시하지 않고 인기·핫 게시글 집계용 (예: 최근 7일 줄 수)
 *   → viewer_key: 로그인 `user:{userId}`, 비로그인 `anon:{쿠키 uuid}`
 *   → 게시글이 삭제되면 함께 삭제됨
 */
export const postView = comdraftSchema.table(
  'post_view',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    postId: text('post_id')
      .notNull()
      .references(() => post.id, { onDelete: 'cascade' }),
    viewerKey: text('viewer_key').notNull(),
    viewedAt: timestamp('viewed_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // 같은 사람의 최근 기록 확인 (30일 규칙)
    index('post_view_post_viewer_idx').on(
      table.postId,
      table.viewerKey,
      table.viewedAt.desc(),
    ),
    // 글별 기간 집계
    index('post_view_post_viewed_idx').on(table.postId, table.viewedAt),
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
