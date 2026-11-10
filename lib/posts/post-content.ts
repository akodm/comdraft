import { getSchema } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { DraftBlank } from '@/lib/studio/draft-blank-node';
import { normalizeBlankAttrs } from '@/lib/studio/draft-blank';
import { extractDraftTitle } from '@/lib/studio/draft-content';
import {
  createDraftSchemaExtensions,
  DRAFT_HEADING_LEVELS,
} from '@/lib/studio/editor-schema';

/**
 * 초안을 게시할 때 쓰는 순수 함수 (서버/클라이언트 공용, 테스트 가능)
 * - 게시 가능 검사, 공개용 본문 정리, 목록용 요약 추출
 */

export type PublishCheck =
  | { status: 'ok'; title: string }
  | { status: 'has_blanks'; count: number }
  | { status: 'no_title' };

export const POST_EXCERPT_MAX_LENGTH = 160;

// 게시 본문에서 허용하는 링크 프로토콜
const ALLOWED_LINK_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

const schema = getSchema(createDraftSchemaExtensions());

/** 게시할 수 없는 구조의 문서 (루트가 doc 이 아니거나 스키마에 맞지 않음) */
export class InvalidPostContentError extends Error {
  constructor(message = '게시할 수 없는 문서입니다.') {
    super(message);
    this.name = 'InvalidPostContentError';
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// 클라이언트가 보낸 JSON 이라 content 가 배열이 아니거나 자식이 객체가 아닐 수 있음
const getChildren = (node: JSONContent): JSONContent[] =>
  Array.isArray(node.content) ? node.content.filter(isRecord) : [];

// 채워졌든 아니든 남아 있는 빈칸 노드는 모두 게시를 막으므로 전부 센다
const countBlankNodes = (node: JSONContent): number =>
  (node.type === DraftBlank.name ? 1 : 0) +
  getChildren(node).reduce((sum, child) => sum + countBlankNodes(child), 0);

// 제목·요약 추출 함수가 잘못된 구조에서 던지지 않도록 모양만 다듬은 사본
const normalizeShape = (node: JSONContent): JSONContent => ({
  type: typeof node.type === 'string' ? node.type : undefined,
  text: typeof node.text === 'string' ? node.text : undefined,
  content: getChildren(node).map(normalizeShape),
});

/**
 * 게시 가능 여부 (빈칸 검사가 제목 검사보다 먼저)
 * - 구조가 잘못된 항목은 무시하고 검사 (루트가 객체가 아니면 InvalidPostContentError)
 */
export const checkPublishable = (doc: JSONContent): PublishCheck => {
  if (!isRecord(doc)) {
    throw new InvalidPostContentError();
  }

  const count = countBlankNodes(doc);

  if (count > 0) {
    return { status: 'has_blanks', count };
  }

  const title = extractDraftTitle(normalizeShape(doc));

  return title ? { status: 'ok', title } : { status: 'no_title' };
};

const isAllowedHref = (href: unknown): href is string => {
  if (typeof href !== 'string') {
    return false;
  }

  try {
    return ALLOWED_LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
};

const CODE_LANGUAGE_PATTERN = /^[\w+#.-]{1,32}$/;

type Attrs = Record<string, unknown>;

// 노드 종류별 속성 값 검증 (값이 틀리면 속성을 빼서 스키마 기본값이 쓰이게 함)
const sanitizeNodeAttrs = (type: string, attrs: Attrs): Attrs | undefined => {
  switch (type) {
    case 'heading':
      return (DRAFT_HEADING_LEVELS as readonly unknown[]).includes(attrs.level)
        ? { level: attrs.level }
        : undefined;
    case 'codeBlock':
      return {
        language:
          typeof attrs.language === 'string' &&
          CODE_LANGUAGE_PATTERN.test(attrs.language)
            ? attrs.language
            : null,
      };
    case DraftBlank.name:
      return normalizeBlankAttrs(attrs);
    case 'orderedList':
      return Number.isInteger(attrs.start) && (attrs.start as number) >= 1
        ? { start: attrs.start }
        : undefined;
    default:
      return undefined;
  }
};

// 링크는 검증한 href 만 남기고 target/rel/class 는 스키마 기본값(편집기 설정)에 맡김
const sanitizeMark = (mark: unknown) => {
  if (!isRecord(mark) || typeof mark.type !== 'string') {
    return null;
  }

  if (!schema.marks[mark.type]) {
    return null;
  }

  if (mark.type === 'link') {
    const href = isRecord(mark.attrs) ? mark.attrs.href : undefined;

    return isAllowedHref(href) ? { type: 'link', attrs: { href } } : null;
  }

  // 그 밖의 마크(굵게, 기울임, 코드 등)는 속성을 쓰지 않음
  return { type: mark.type };
};

const sanitizeMarks = (marks: unknown) => {
  const cleaned = (Array.isArray(marks) ? marks : []).flatMap((mark) => {
    const result = sanitizeMark(mark);

    return result ? [result] : [];
  });

  return cleaned.length > 0 ? cleaned : undefined;
};

const sanitizeNode = (node: unknown): JSONContent | null => {
  if (!isRecord(node)) {
    return null;
  }

  if (node.type === 'text') {
    if (typeof node.text !== 'string' || node.text === '') {
      return null;
    }

    const marks = sanitizeMarks(node.marks);

    return marks
      ? { type: 'text', text: node.text, marks }
      : { type: 'text', text: node.text };
  }

  if (typeof node.type !== 'string' || !schema.nodes[node.type]) {
    return null;
  }

  const attrs = sanitizeNodeAttrs(
    node.type,
    isRecord(node.attrs) ? node.attrs : {},
  );
  const content = (Array.isArray(node.content) ? node.content : []).flatMap(
    (child) => {
      const cleaned = sanitizeNode(child);

      return cleaned ? [cleaned] : [];
    },
  );

  return {
    type: node.type,
    ...(attrs ? { attrs } : {}),
    ...(content.length > 0 ? { content } : {}),
  };
};

/**
 * 공개용 본문 정리 (공개 페이지에 그대로 그려지므로 보안 경계)
 * - 스키마에 없는 노드/마크를 버리고, 속성은 값까지 검증해 안전한 것만 남김
 * - 링크는 http·https·mailto 의 href 만 남기고 아니면 마크만 지움 (글자는 유지)
 * - draftBlank 노드는 그대로 남기므로 호출하기 전에 checkPublishable 로 빈칸이 없는지 확인할 것
 * - 구조가 문서 스키마에 맞지 않으면 InvalidPostContentError
 */
export const sanitizePostContent = (doc: JSONContent): JSONContent => {
  const cleaned = sanitizeNode(doc);

  if (!cleaned || cleaned.type !== 'doc') {
    throw new InvalidPostContentError();
  }

  try {
    const node = schema.nodeFromJSON(cleaned);

    node.check();

    return node.toJSON() as JSONContent;
  } catch {
    throw new InvalidPostContentError();
  }
};

const getParagraphText = (node: JSONContent): string => {
  if (node.type === 'text') {
    return typeof node.text === 'string' ? node.text : '';
  }

  // 줄바꿈은 단어가 붙지 않도록 공백으로
  if (node.type === 'hardBreak') {
    return ' ';
  }

  return getChildren(node).map(getParagraphText).join('');
};

/** 목록용 요약 (최상위 문단 글자만 이어 160자까지, 코드·제목은 건너뜀) */
export const extractPostExcerpt = (doc: JSONContent): string => {
  if (!isRecord(doc)) {
    return '';
  }

  const text = getChildren(doc)
    .filter((node) => node.type === 'paragraph')
    .map((node) => getParagraphText(node).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');

  // 서로게이트 쌍이 쪼개지지 않도록 코드 포인트 단위로 자름
  return Array.from(text).slice(0, POST_EXCERPT_MAX_LENGTH).join('').trim();
};

// 노드 하나에서 뽑은 제목 (게시글 제목을 뽑을 때와 같은 공백 정리·길이 제한)
const getNodeTitle = (node: JSONContent) =>
  extractDraftTitle({ type: 'doc', content: [node] });

/**
 * 상세 페이지 머리에 제목을 따로 보여 주므로, 본문 맨 앞의 같은 제목은 뺌
 * - 글자가 있는 첫 블록이 제목(heading)이고 게시글 제목과 같을 때만 뺌 (그 밖에는 그대로)
 * @example removeLeadingTitle(doc(h(1, '제목'), p('본문')), '제목') // doc(p('본문'))
 */
export const removeLeadingTitle = (
  doc: JSONContent,
  title: string,
): JSONContent => {
  const nodes = getChildren(doc);
  const index = nodes.findIndex((node) => getNodeTitle(node) !== '');
  const node = nodes[index];

  if (!node || node.type !== 'heading' || getNodeTitle(node) !== title) {
    return doc;
  }

  return { ...doc, content: nodes.toSpliced(index, 1) };
};
