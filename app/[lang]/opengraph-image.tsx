import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config';
import { getI18nInstance } from '@/lib/i18n/instances';
import { OG_FEATURES, OG_TAGLINE } from '@/lib/seo/copy';
import { OG_IMAGE_SIZE, renderSiteOgImage } from '@/lib/seo/og-image';

// 사이트 기본 오픈그래프 이미지 (메인, 게시글 목록 등 이 아래 페이지 공통, 언어별)
export const alt = 'comdraft';
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';
// 언어별 문구만 쓰는 고정 이미지라 한 번 만들어 둠 (요청마다 글꼴을 받지 않도록)
export const dynamic = 'force-static';

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
