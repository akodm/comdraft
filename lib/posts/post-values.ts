import type { JSONContent } from '@tiptap/core';
import { POST_VISIBILITIES, type PostVisibility } from '@/lib/db/schema/post';
import type { Locale } from '@/lib/i18n/config';
import {
  extractPostExcerpt,
  sanitizePostContent,
} from '@/lib/posts/post-content';
import { createPostSlug } from '@/lib/posts/post-path';

/**
 * 게시글 저장 값 조립 (서버 액션에서 쓰는 순수 함수, 테스트 가능)
 */

// 클라이언트가 보낸 공개 범위를 확인 (허용 값이 아니면 null)
export const parsePostVisibility = (value: unknown): PostVisibility | null => {
  return POST_VISIBILITIES.find((visibility) => visibility === value) ?? null;
};

/**
 * 게시글에 저장할 값 (본문은 정리한 스냅샷, 요약은 정리한 본문에서 추출)
 * - 잘못된 구조면 sanitizePostContent 가 InvalidPostContentError 를 던짐
 * - 빈칸 검사는 호출하는 쪽에서 먼저 해야 함 (checkPublishable)
 */
export const buildPostValues = (
  content: JSONContent,
  title: string,
  locale: Locale,
  visibility: PostVisibility,
) => {
  const sanitized = sanitizePostContent(content);

  return {
    title,
    slug: createPostSlug(title),
    excerpt: extractPostExcerpt(sanitized),
    content: sanitized,
    visibility,
    locale,
  };
};
