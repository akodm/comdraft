// 게시글 기술 태그 규칙 (사용자 입력, AI 결과 반영, 게시 복사가 모두 이 규칙을 거침)
export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

/**
 * 태그 하나 정규화: 소문자, 앞뒤 공백 제거, 안쪽 연속 공백은 - 하나로
 * - 그 밖의 글자(., #, + 등)는 그대로
 * - 코드 포인트 기준 30자로 자른 뒤 끝에 남은 - 는 지움
 */
export const normalizeTag = (value: string): string => {
  const tag = value.trim().toLowerCase().replace(/\s+/g, '-');

  return Array.from(tag).slice(0, MAX_TAG_LENGTH).join('').replace(/-+$/, '');
};

// 태그 목록 정규화: 문자열만, 빈 값·중복(정규화 뒤, 먼저 것 유지) 제거, 앞 10개
export const normalizeTags = (values: unknown): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }

  const tags = new Set<string>();

  for (const value of values) {
    if (tags.size >= MAX_TAGS) {
      break;
    }

    if (typeof value !== 'string') {
      continue;
    }

    const tag = normalizeTag(value);

    if (tag) {
      tags.add(tag);
    }
  }

  return [...tags];
};

export type AddTagResult =
  | { status: 'added'; tags: string[] }
  | { status: 'empty' | 'duplicate' | 'full' };

// 편집기에서 태그 하나 추가 (추가할 수 없으면 이유를 돌려줌)
export const addTag = (tags: string[], input: string): AddTagResult => {
  const tag = normalizeTag(input);

  if (!tag) {
    return { status: 'empty' };
  }

  if (tags.includes(tag)) {
    return { status: 'duplicate' };
  }

  if (tags.length >= MAX_TAGS) {
    return { status: 'full' };
  }

  return { status: 'added', tags: [...tags, tag] };
};
