import { describe, expect, it } from 'vitest';
import { fillDailySignups, SIGNUP_EMAIL_LIMIT } from '@/lib/admin/user-trend';

// 2026-11-20 12:00 KST
const NOW = new Date('2026-11-20T03:00:00Z');

describe('fillDailySignups', () => {
  it('한국 시간 날짜로 묶고 가입이 없는 날은 0 으로 채운다', () => {
    const result = fillDailySignups(
      [
        // 11/19 23:30 KST
        { createdAt: new Date('2026-11-19T14:30:00Z'), email: 'b@x.dev' },
        // 11/20 00:10 KST (UTC 로는 11/19)
        { createdAt: new Date('2026-11-19T15:10:00Z'), email: 'c@x.dev' },
        // 11/19 09:00 KST
        { createdAt: new Date('2026-11-19T00:00:00Z'), email: 'a@x.dev' },
      ],
      NOW,
      3,
    );

    expect(result).toEqual([
      { date: '2026-11-18', count: 0, emails: [], moreCount: 0 },
      {
        date: '2026-11-19',
        count: 2,
        emails: ['a@x.dev', 'b@x.dev'],
        moreCount: 0,
      },
      { date: '2026-11-20', count: 1, emails: ['c@x.dev'], moreCount: 0 },
    ]);
  });

  it('이메일은 최대 개수만 남기고 나머지는 개수로 센다', () => {
    const rows = Array.from({ length: SIGNUP_EMAIL_LIMIT + 3 }, (_, index) => ({
      createdAt: new Date(
        `2026-11-20T01:${String(index).padStart(2, '0')}:00Z`,
      ),
      email: `u${index}@x.dev`,
    }));
    const [today] = fillDailySignups(rows, NOW, 1);

    expect(today.count).toBe(SIGNUP_EMAIL_LIMIT + 3);
    expect(today.emails).toHaveLength(SIGNUP_EMAIL_LIMIT);
    expect(today.emails[0]).toBe('u0@x.dev');
    expect(today.moreCount).toBe(3);
  });
});
