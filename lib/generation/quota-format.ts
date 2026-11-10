import type { Locale } from '@/lib/i18n/config';

// 초기화 시각은 사용자 위치와 상관없이 항상 서울 기준으로 표기
const QUOTA_TIME_ZONE = 'Asia/Seoul';

/**
 * 할당량 초기화 시각 표기
 * @example formatQuotaReset(new Date('2026-11-14T15:00:00Z'), 'ko') // '11월 15일(일) 0시'
 * @example formatQuotaReset(new Date('2026-11-14T15:00:00Z'), 'en') // 'Sun, Nov 15, 12:00 AM (GMT+9)'
 */
export const formatQuotaReset = (resetsAt: Date, locale: Locale) => {
  if (locale === 'ko') {
    const parts = new Intl.DateTimeFormat('ko', {
      timeZone: QUOTA_TIME_ZONE,
      month: 'numeric',
      day: 'numeric',
      weekday: 'short',
      hour: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(resetsAt);
    const pick = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? '';

    return `${pick('month')}월 ${pick('day')}일(${pick('weekday')}) ${pick('hour')}시`;
  }

  const options: Intl.DateTimeFormatOptions = {
    timeZone: QUOTA_TIME_ZONE,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };
  // 시간대 약어는 Intl 결과를 그대로 쓰고 괄호로 감쌈 (Node 기준 GMT+9)
  const zone = new Intl.DateTimeFormat('en', {
    ...options,
    timeZoneName: 'short',
  })
    .formatToParts(resetsAt)
    .find((part) => part.type === 'timeZoneName')?.value;

  return `${new Intl.DateTimeFormat('en', options).format(resetsAt)} (${zone})`;
};
