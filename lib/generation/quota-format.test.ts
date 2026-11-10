import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatQuotaReset } from '@/lib/generation/quota-format';

describe('formatQuotaReset', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ko', () => {
    expect(formatQuotaReset(new Date('2026-11-15T15:00:00Z'), 'ko')).toBe(
      '11월 16일(월) 0시',
    );
  });

  it('en', () => {
    expect(formatQuotaReset(new Date('2026-11-14T15:00:00Z'), 'en')).toBe(
      'Sun, Nov 15, 12:00 AM (GMT+9)',
    );
  });

  it('en 시간대 약어를 얻지 못하면 KST 로 표기', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts').mockReturnValue([
      { type: 'literal', value: '' },
    ]);

    expect(formatQuotaReset(new Date('2026-11-14T15:00:00Z'), 'en')).toBe(
      'Sun, Nov 15, 12:00 AM (KST)',
    );
  });

  it('서버 시간대와 상관없이 서울 기준으로 표기', () => {
    // UTC 로는 토요일이지만 서울로는 일요일 0시
    expect(formatQuotaReset(new Date('2026-11-14T15:00:00Z'), 'ko')).toBe(
      '11월 15일(일) 0시',
    );
  });
});
