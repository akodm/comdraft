import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  numeric,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';
import { comdraftSchema } from '@/lib/db/pg-schema';

/**
 * 사용량 할당량 정책 테이블
 * - 등급(role)마다 한 행, 한도와 초과 허용 비율, 초기화 시점을 여기서만 관리 (코드에 상수로 두지 않음)
 * - user.role 이 이 테이블의 role 을 참조
 */
export const quotaPlan = comdraftSchema.table(
  'quota_plan',
  {
    // 등급 이름 (basic, pro, max)
    role: text('role').primaryKey(),
    // 주당 사용 가능한 토큰 수
    weeklyTokenLimit: integer('weekly_token_limit').notNull(),
    // 남은 양 대비 한 번에 허용하는 초과 비율 (1.30 이면 남은 양의 130% 까지 허용)
    overrunRatio: numeric('overrun_ratio', {
      precision: 4,
      scale: 2,
      mode: 'number',
    }).notNull(),
    // 주 시작을 계산할 시간대 (IANA 이름)
    resetTimezone: text('reset_timezone').notNull(),
    // 초기화 요일 (0 = 일요일 ... 6 = 토요일)
    resetWeekday: smallint('reset_weekday').notNull(),
    // 초기화 시각 (0~23시)
    resetHour: smallint('reset_hour').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check('quota_plan_limit_check', sql`${table.weeklyTokenLimit} > 0`),
    check('quota_plan_ratio_check', sql`${table.overrunRatio} >= 1`),
    check(
      'quota_plan_weekday_check',
      sql`${table.resetWeekday} between 0 and 6`,
    ),
    check('quota_plan_hour_check', sql`${table.resetHour} between 0 and 23`),
  ],
);

export type QuotaPlanRow = typeof quotaPlan.$inferSelect;
