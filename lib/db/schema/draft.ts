import { relations, sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { comdraftSchema } from '@/lib/db/pg-schema';
import type { Locale } from '@/lib/i18n/config';
import { user } from '@/lib/db/schema/auth';
import { githubRepository, userRepository } from '@/lib/db/schema/github';

/**
 * 초안 작성 스튜디오 테이블
 *
 * - draft: 사용자가 연동한 저장소별 기술 블로그 초안 (스튜디오 왼쪽 사이드바의 한 항목)
 *   → (user_id, repository_id) 가 user_repository 를 참조하므로 연동한 저장소에만 만들 수 있고,
 *     저장소 연동을 해제하면 그 저장소의 초안도 함께 삭제됨
 * - draft_prompt: 초안에 보낸 작성 요청 기록 (요청 문구 + 기본 옵션 + 선택한 커밋) 이자 AI 작성 작업
 *   → 초안이 삭제돼도 행은 남고 draft_id 만 null (사용자의 주간 사용량이 줄어들지 않도록 user_id 로 셈)
 *   → 커밋 내용(메시지/작성자 등)은 저장하지 않고 SHA 만 남김, 내용은 필요할 때 GitHub API 로 조회
 *   → Lambda 가 구분 → 분석 → 작성 단계를 마칠 때마다 step/status 를 갱신하고 channel 로 Realtime Broadcast
 *   → 초안마다 진행 중(queued/running)인 작업은 하나만 (진행 중에는 초안 편집 잠금)
 * - draft_reference_link: 초안의 작성 요청에 함께 쓰는 참고 링크 (초안마다 따로 관리)
 *   → 주소만 저장하고 서버에서 링크를 열어 보지 않음 (SSRF 방지)
 */

// 사이드바에 표시하는 초안 상태 ('초안' | '임시' | '게시')
export const DRAFT_STATUSES = ['draft', 'temporary', 'published'] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

// AI 작성 작업 상태 (queued: Lambda 호출 전/대기, running: 단계 진행 중, completed/failed: 종료)
export const DRAFT_PROMPT_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
] as const;
export type DraftPromptStatus = (typeof DRAFT_PROMPT_STATUSES)[number];

// 완료한 단계 (0: 시작 전, 1: 구분, 2: 분석, 3: 작성)
export const DRAFT_PROMPT_LAST_STEP = 3;

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
    // 요청한 사용자 (주간/시간당 사용량은 이 컬럼으로 셈, 계정을 삭제하면 함께 삭제)
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // 초안을 삭제하거나 저장소 연동을 해제해도 작업 행은 남김 (사용량과 요청 기록 유지, 초안 화면에서는 보이지 않음)
    draftId: text('draft_id').references(() => draft.id, {
      onDelete: 'set null',
    }),
    prompt: text('prompt').notNull(),
    // 기본 옵션 값 (lib/studio/options.ts 의 키)
    tone: text('tone').notNull(),
    postType: text('post_type').notNull(),
    length: text('length').notNull(),
    requiredBlocks: text('required_blocks').array().default([]).notNull(),
    // 요청에 사용한 커밋 SHA (최신순)
    commitShas: text('commit_shas').array().default([]).notNull(),
    // 요청한 화면의 로케일 (작성 프롬프트 언어와 결과 글 언어, lib/i18n/config.ts 의 LOCALES)
    locale: text('locale').$type<Locale>().default('ko').notNull(),
    status: text('status')
      .$type<DraftPromptStatus>()
      .default('queued')
      .notNull(),
    step: smallint('step').default(0).notNull(),
    // Realtime Broadcast 채널 이름 (URL 에 노출되는 id 와 별개인 추측 불가능한 값, 신호만 전송)
    channel: uuid('channel').defaultRandom().notNull().unique(),
    // 작성 단계 결과 (Markdown, 에디터에 반영할 때 Tiptap 문서로 변환)
    result: text('result'),
    // 실패 사유 코드 (요청/코드 원문 없이)
    errorCode: text('error_code'),
    // 요청 시점의 예상 토큰 수 (Lambda 가 한도 검사 때 기록, 진행 중인 작업의 사용량 추정에 사용)
    estimatedTokens: integer('estimated_tokens'),
    // 실제 사용한 토큰 수 (입력, 출력, 캐시 생성, 캐시 읽기 합계, 실패한 작업도 쓴 만큼 남음)
    usedTokens: integer('used_tokens').default(0).notNull(),
    // 요청에 사용한 참조 링크 URL (요청 당시 값 보존)
    referenceUrls: jsonb('reference_urls')
      .$type<string[]>()
      .default([])
      .notNull(),
    // Lambda 가 처리를 시작한 시각 (시간 초과 판정 기준)
    startedAt: timestamp('started_at', { withTimezone: true, precision: 3 }),
    finishedAt: timestamp('finished_at', { withTimezone: true, precision: 3 }),
    // 완료한 작업의 결과를 초안 본문에 반영한 시각 (반영은 한 번만, null 이면 아직 반영 전이라 편집 잠금)
    appliedAt: timestamp('applied_at', { withTimezone: true, precision: 3 }),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('draft_prompt_draft_created_idx').on(
      table.draftId,
      table.createdAt.desc(),
    ),
    // 사용자의 주간 사용량 / 시간당 요청 수 조회
    index('draft_prompt_user_created_idx').on(table.userId, table.createdAt),
    // 초안마다 진행 중인 작업은 하나만 (동시 요청 방지, 편집 잠금 조회에도 사용)
    uniqueIndex('draft_prompt_draft_active_unique')
      .on(table.draftId)
      .where(sql`${table.status} in ('queued', 'running')`),
    check(
      'draft_prompt_status_check',
      sql`${table.status} in ('queued', 'running', 'completed', 'failed')`,
    ),
    check(
      'draft_prompt_step_check',
      sql`${table.step} between 0 and ${sql.raw(String(DRAFT_PROMPT_LAST_STEP))}`,
    ),
    check('draft_prompt_locale_check', sql`${table.locale} in ('ko', 'en')`),
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
