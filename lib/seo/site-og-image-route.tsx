import 'server-only';
import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config';
import { getI18nInstance } from '@/lib/i18n/instances';
import { OG_FEATURES, OG_TAGLINE } from '@/lib/seo/copy';
import { OG_IMAGE_SIZE, renderSiteOgImage } from '@/lib/seo/og-image';

/**
 * 사이트 기본 오픈그래프 이미지 라우트 (언어별 문구)
 * - openGraph 를 직접 정하는 페이지는 부모 이미지가 이어지지 않으므로 그 세그먼트의 opengraph-image 가 이 모듈을 다시 내보냄
 * - 세그먼트 설정(dynamic)은 정적으로 읽혀야 해서 각 파일에 직접 둠
 */
export const alt = 'comdraft';
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

export default async function SiteOgImage({
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
