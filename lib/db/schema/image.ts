import { index, integer, text, timestamp } from 'drizzle-orm/pg-core';
import { comdraftSchema } from '@/lib/db/pg-schema';
import { user } from '@/lib/db/schema/auth';
import { draft } from '@/lib/db/schema/draft';

/**
 * 초안 본문에 넣은 이미지 기록 테이블
 * - 파일은 공개 버킷(comdraft-images)의 path 에 WebP 로 저장, 이 테이블은 소유와 사용량을 추적
 * - 사용자가 삭제되면 함께 삭제, 초안이 삭제되면 draft_id 만 null (파일 정리는 서버에서 처리)
 */
export const image = comdraftSchema.table(
  'image',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // 이미지를 올린 초안 (초안이 삭제되면 null)
    draftId: text('draft_id').references(() => draft.id, {
      onDelete: 'set null',
    }),
    // 버킷 안 경로 ({userId}/{imageId}.webp)
    path: text('path').notNull().unique(),
    // 변환 후 크기
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
    // 마지막 사용 시각: 올린 시각, 그 뒤로는 이 경로가 든 본문(초안·게시글)을 저장할 때마다 갱신
    // (정리 유예의 기준: 잘라 붙이기나 실행 취소로 잠깐 본문에서 빠진 이미지를 지우지 않도록)
    lastUsedAt: timestamp('last_used_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('image_draft_idx').on(table.draftId),
    index('image_user_created_idx').on(table.userId, table.createdAt),
  ],
);

export type ImageRow = typeof image.$inferSelect;
