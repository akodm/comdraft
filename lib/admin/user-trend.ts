import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';
import { VIEW_TIMEZONE, viewRangeStart } from '@/lib/admin/post-views';

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 일별 새 사용자 (어드민 그래프용 순수 함수)
 * - 날짜는 한국 시간 기준, 가입이 없는 날도 0 으로 채움
 * - 툴팁에 그날 가입한 사용자 이메일을 보여 주되, 많으면 앞의 일부만 남기고 나머지는 개수로
 * - 탈퇴한 사용자는 user 행이 지워져 가입 수에서도 빠짐
 */

// 툴팁에 보여 줄 이메일 최대 개수
export const SIGNUP_EMAIL_LIMIT = 10;

export interface DailySignups {
  // YYYY-MM-DD (한국 시간)
  date: string;
  count: number;
  // 가입 순 이메일 (최대 SIGNUP_EMAIL_LIMIT 개)
  emails: string[];
  // emails 에 담지 못한 나머지 수
  moreCount: number;
}

export function fillDailySignups(
  rows: Array<{ createdAt: Date; email: string }>,
  now: Date,
  days: number,
): DailySignups[] {
  const byDate = new Map<string, string[]>();
  const sorted = [...rows].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );

  for (const { createdAt, email } of sorted) {
    const date = dayjs(createdAt).tz(VIEW_TIMEZONE).format('YYYY-MM-DD');
    byDate.set(date, [...(byDate.get(date) ?? []), email]);
  }

  const first = dayjs(viewRangeStart(now, days)).tz(VIEW_TIMEZONE);

  return Array.from({ length: days }, (_, index) => {
    const date = first.add(index, 'day').format('YYYY-MM-DD');
    const emails = byDate.get(date) ?? [];

    return {
      date,
      count: emails.length,
      emails: emails.slice(0, SIGNUP_EMAIL_LIMIT),
      moreCount: Math.max(0, emails.length - SIGNUP_EMAIL_LIMIT),
    };
  });
}
