import 'server-only';
import type { MessageDescriptor } from '@lingui/core';
import type { Metadata } from 'next';
import { getLocale, initLingui } from '@/lib/i18n/server';
import { getSiteOrigin } from '@/lib/posts/metadata';
import { buildWebsiteOpenGraph } from '@/lib/seo/open-graph';
import { buildLocalizedAlternates } from '@/lib/seo/urls';

/**
 * 언어별로 같은 내용을 보여 주는 고정 페이지의 메타데이터 (개인정보처리방침, 이용약관 등)
 * - 제목·설명, 언어별 대표 주소와 hreflang, 오픈그래프 (이미지는 그 세그먼트의 opengraph-image)
 */
export const buildStaticPageMetadata = async (
  path: string,
  titleMessage: MessageDescriptor,
  descriptionMessage: MessageDescriptor,
): Promise<Metadata> => {
  const i18n = await initLingui();
  const locale = await getLocale();
  const origin = getSiteOrigin();
  const title = i18n._(titleMessage);
  const description = i18n._(descriptionMessage);
  const alternates = origin
    ? buildLocalizedAlternates(origin, path, locale)
    : undefined;

  return {
    title,
    description,
    alternates,
    openGraph: buildWebsiteOpenGraph({
      locale,
      title,
      description,
      url: alternates?.canonical,
    }),
    twitter: { card: 'summary_large_image', title, description },
  };
};
