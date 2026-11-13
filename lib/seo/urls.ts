import { LOCALES, localizePath, type Locale } from '@/lib/i18n/config';

/**
 * 언어별 페이지의 대표 주소와 hreflang 주소
 * - x-default 는 언어 없는 주소: proxy 가 방문자의 언어(쿠키·Accept-Language)로 보냄
 * - query(예: `?page=2`)는 모든 주소에 같이 붙음
 */
export const buildLocalizedAlternates = (
  origin: string,
  path: string,
  locale: Locale,
  query = '',
) => {
  const urlFor = (target: Locale) =>
    `${origin}${localizePath(target, path)}${query}`;

  return {
    canonical: urlFor(locale),
    languages: {
      ...Object.fromEntries(LOCALES.map((target) => [target, urlFor(target)])),
      'x-default': `${origin}${path}${query}`,
    } as Record<Locale | 'x-default', string>,
  };
};
