import { DEFAULT_LOCALE, isLocale } from '@/lib/i18n/config';
import { getI18nInstance } from '@/lib/i18n/instances';
import { parsePostPath } from '@/lib/posts/post-path';
import { getPublishedPost } from '@/lib/posts/queries';
import { OG_FEATURES, OG_TAGLINE } from '@/lib/seo/copy';
import {
  OG_IMAGE_SIZE,
  renderPostOgImage,
  renderSiteOgImage,
} from '@/lib/seo/og-image';

// 게시글 오픈그래프 이미지 (제목, 기술 태그, 작성자)
export const alt = 'comdraft';
export const size = OG_IMAGE_SIZE;
export const contentType = 'image/png';

// 주소 세그먼트를 디코드해 게시글 ID 를 꺼냄 (형식이 틀리면 null)
const parsePostId = (segment: string) => {
  try {
    return parsePostPath(decodeURIComponent(segment))?.id ?? null;
  } catch {
    return null;
  }
};

export default async function Image({
  params,
}: {
  params: Promise<{ lang: string; postPath: string }>;
}) {
  const { lang, postPath } = await params;
  const id = parsePostId(postPath);
  const post = id ? await getPublishedPost(id) : null;

  // 게시 취소된 글이나 잘못된 주소는 사이트 기본 이미지
  if (!post) {
    const i18n = getI18nInstance(isLocale(lang) ? lang : DEFAULT_LOCALE);

    return renderSiteOgImage({
      tagline: i18n._(OG_TAGLINE),
      features: i18n._(OG_FEATURES),
    });
  }

  return renderPostOgImage({
    title: post.title,
    tags: post.tags,
    authorName: post.author.name,
  });
}
