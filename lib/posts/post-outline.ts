import type { JSONContent } from '@tiptap/core';

/**
 * 게시글 본문 제목의 앵커와 목차 (서버/클라이언트 공용 순수 함수)
 * - 게시 본문은 제목에 id 가 없으므로 그릴 때마다 제목 글자로 같은 id 를 만듦
 */

export interface PostHeading {
  id: string;
  level: number;
  text: string;
}

export interface PostOutline {
  // 제목마다 attrs.id 를 붙인 본문 사본 (원본은 바꾸지 않음)
  content: JSONContent;
  // 본문 순서대로의 모든 제목 (H1 포함)
  headings: PostHeading[];
}

// 목차에 넣는 가장 높은 제목 단계 (H1 은 글 제목이라 제외)
export const TOC_MIN_LEVEL = 2;

// 글자를 뽑지 못한 제목의 id
const FALLBACK_SLUG = 'section';

const getChildren = (node: JSONContent): JSONContent[] =>
  Array.isArray(node.content) ? node.content : [];

const getHeadingText = (node: JSONContent): string => {
  if (node.type === 'text') {
    return typeof node.text === 'string' ? node.text : '';
  }

  // 줄바꿈은 단어가 붙지 않도록 공백으로
  if (node.type === 'hardBreak') {
    return ' ';
  }

  return getChildren(node).map(getHeadingText).join('');
};

/**
 * 제목 글자로 앵커 id 를 만듦 (한글 등 글자·숫자는 남기고 공백은 -, 나머지 기호는 뺌)
 * @example toHeadingSlug('Next.js 16 시작하기!') // 'nextjs-16-시작하기'
 */
export const toHeadingSlug = (text: string) =>
  text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-') || FALLBACK_SLUG;

const getHeadingLevel = (node: JSONContent) => {
  const level = node.attrs?.level;

  return typeof level === 'number' ? level : 1;
};

/**
 * 본문 제목에 문서 순서대로 겹치지 않는 id 를 붙이고 제목 목록을 뽑음
 * - 같은 글자의 제목은 뒤에 -1, -2 를 붙임 (본문이 같으면 항상 같은 id)
 * - 인용문 등 안에 들어간 제목도 포함
 */
export const buildPostOutline = (doc: JSONContent): PostOutline => {
  const headings: PostHeading[] = [];
  const usedIds = new Set<string>();

  const createId = (text: string) => {
    const base = toHeadingSlug(text);
    let id = base;

    for (let suffix = 1; usedIds.has(id); suffix += 1) {
      id = `${base}-${suffix}`;
    }

    usedIds.add(id);

    return id;
  };

  const visit = (node: JSONContent): JSONContent => {
    if (node.type === 'heading') {
      const text = getHeadingText(node).replace(/\s+/g, ' ').trim();
      const id = createId(text);

      headings.push({ id, level: getHeadingLevel(node), text });

      return { ...node, attrs: { ...node.attrs, id } };
    }

    const children = getChildren(node);

    return children.length > 0
      ? { ...node, content: children.map(visit) }
      : node;
  };

  const content = visit(doc);

  return { content, headings };
};

/**
 * 목차에 넣을 제목 (H2 이하, 글자가 있는 것만)
 * - H2 가 하나도 없으면 목차를 그리지 않도록 빈 목록
 */
export const getTocHeadings = (headings: PostHeading[]): PostHeading[] => {
  const items = headings.filter(
    ({ level, text }) => level >= TOC_MIN_LEVEL && text,
  );

  return items.some(({ level }) => level === TOC_MIN_LEVEL) ? items : [];
};
