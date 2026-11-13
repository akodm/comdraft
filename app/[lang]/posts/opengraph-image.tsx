import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config';
import { getI18nInstance } from '@/lib/i18n/instances';
import { OG_FEATURES, OG_TAGLINE } from '@/lib/seo/copy';
import { OG_IMAGE_SIZE, renderSiteOgImage } from '@/lib/seo/og-image';

// 게시글 목록의 오픈그래프 이미지 (사이트 기본 이미지와 같음)
// - 목록 페이지가 openGraph 를 직접 정해 부모의 이미지가 이어지지 않으므로 이 세그먼트에도 둠
export const alt = 'comdraft';
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const i18n = getI18nInstance(isLocale(lang) ? lang : DEFAULT_LOCALE);

  return renderSiteOgImage({
    tagline: i18n._(OG_TAGLINE),
    features: i18n._(OG_FEATURES),
  });
}
