import type { Locale } from '@/lib/i18n/config';

interface BlogPostingInput {
  url: string;
  title: string;
  description: string;
  image: string;
  publishedAt: Date;
  updatedAt: Date;
  authorName: string;
  // 작성자 GitHub 프로필 (없으면 넣지 않음)
  authorUrl: string | null;
  tags: string[];
  locale: Locale;
}

// 게시글 상세의 구조화 데이터 (schema.org BlogPosting)
export const buildBlogPostingJsonLd = (input: BlogPostingInput) => ({
  '@context': 'https://schema.org',
  '@type': 'BlogPosting',
  headline: input.title,
  description: input.description,
  url: input.url,
  mainEntityOfPage: input.url,
  image: input.image,
  datePublished: input.publishedAt.toISOString(),
  dateModified: input.updatedAt.toISOString(),
  inLanguage: input.locale,
  ...(input.tags.length > 0 ? { keywords: input.tags.join(', ') } : {}),
  author: {
    '@type': 'Person',
    name: input.authorName,
    ...(input.authorUrl ? { url: input.authorUrl } : {}),
  },
});

/**
 * `<script type="application/ld+json">` 에 넣을 문자열
 * - 제목처럼 사용자가 쓴 값에 `</script>` 가 들어 있어도 태그가 닫히지 않도록 `<` 를 이스케이프
 */
export const serializeJsonLd = (data: object): string =>
  JSON.stringify(data).replace(/</g, '\\u003c');
