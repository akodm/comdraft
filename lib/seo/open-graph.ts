import type { Metadata } from 'next';
import { LOCALES, type Locale } from '@/lib/i18n/config';
import { OG_LOCALES, SITE_NAME } from '@/lib/seo/site';

/**
 * 웹사이트 페이지의 오픈그래프 (사이트 이름, 언어, 다른 언어 표기 포함)
 * - 자식 페이지의 openGraph 는 부모 것을 통째로 바꾸므로 페이지마다 이 함수로 전체를 만듦
 */
export const buildWebsiteOpenGraph = ({
  locale,
  title,
  description,
  url,
}: {
  locale: Locale;
  title: string;
  description: string;
  url?: string;
}): NonNullable<Metadata['openGraph']> => ({
  type: 'website',
  siteName: SITE_NAME,
  locale: OG_LOCALES[locale],
  alternateLocale: LOCALES.filter((other) => other !== locale).map(
    (other) => OG_LOCALES[other],
  ),
  title,
  description,
  ...(url ? { url } : {}),
});
