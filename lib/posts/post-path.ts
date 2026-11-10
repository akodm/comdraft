// 게시글 주소(`/posts/{slug}-{id}`) 생성과 파싱. 로케일 접두사는 붙이지 않는다(링크 컴포넌트가 붙임).

import { isPostId } from '@/lib/posts/post-id';

export const POST_SLUG_MAX_LENGTH = 60;

const SEPARATOR = '-';

/** 제목을 URL 에 쓸 slug 로 바꾼다. 쓸 글자가 없으면 빈 문자열이다. */
export function createPostSlug(title: string): string {
  const slug = title
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, SEPARATOR)
    .replace(/^-+|-+$/g, '')
    .slice(0, POST_SLUG_MAX_LENGTH);

  return slug.replace(/-+$/g, '');
}

/** 게시글의 로케일 없는 주소를 만든다. slug 가 비면 ID 만 쓴다. */
export function getPostPath(post: { id: string; slug: string }): string {
  return post.slug
    ? `/posts/${post.slug}${SEPARATOR}${post.id}`
    : `/posts/${post.id}`;
}

/**
 * URL 디코드된 주소 세그먼트를 slug 와 ID 로 나눈다.
 * 마지막 `-` 뒤가 ID 형식이 아니면 null 을 돌려준다.
 */
export function parsePostPath(
  segment: string,
): { id: string; slug: string } | null {
  const separatorIndex = segment.lastIndexOf(SEPARATOR);

  if (separatorIndex === -1) {
    return isPostId(segment) ? { id: segment, slug: '' } : null;
  }

  const id = segment.slice(separatorIndex + SEPARATOR.length);
  if (!isPostId(id)) return null;

  return { id, slug: segment.slice(0, separatorIndex) };
}
