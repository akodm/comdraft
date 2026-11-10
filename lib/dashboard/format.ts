import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';

const INTL_LOCALES: Record<Locale, string> = {
  ko: 'ko-KR',
  en: 'en-US',
};

// 로케일별 포매터는 생성 비용이 있으므로 재사용
const dateTimeFormatters = new Map<Locale, Intl.DateTimeFormat>();

const getDateTimeFormatter = (locale: Locale) => {
  let formatter = dateTimeFormatters.get(locale);

  if (!formatter) {
    formatter = new Intl.DateTimeFormat(INTL_LOCALES[locale], {
      timeZone: 'Asia/Seoul',
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    dateTimeFormatters.set(locale, formatter);
  }

  return formatter;
};

export const formatDateTime = (
  date: Date | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
) => {
  return date ? getDateTimeFormatter(locale).format(date) : '-';
};

// 날짜만 (게시일 등 시각이 필요 없는 곳)
export const formatDate = (date: Date, locale: Locale = DEFAULT_LOCALE) => {
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], {
    timeZone: 'Asia/Seoul',
    dateStyle: 'medium',
  }).format(date);
};

// 로케일에 맞는 천 단위 구분 숫자
export const formatNumber = (
  value: number,
  locale: Locale = DEFAULT_LOCALE,
) => {
  return value.toLocaleString(INTL_LOCALES[locale]);
};

// 커밋 메시지의 첫 줄(제목)만 추출
export const getCommitTitle = (message: string) => {
  return message.split('\n')[0];
};
