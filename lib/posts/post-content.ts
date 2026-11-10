import { getSchema } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import { DraftBlank } from '@/lib/studio/draft-blank-node';
import { extractDraftTitle } from '@/lib/studio/draft-content';
import { createDraftSchemaExtensions } from '@/lib/studio/editor-schema';

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

// 채워졌든 아니든 남아 있는 빈칸 노드는 모두 게시를 막으므로 전부 센다
const countBlankNodes = (node: JSONContent): number =>
  (node.type === DraftBlank.name ? 1 : 0) +
  (node.content ?? []).reduce((sum, child) => sum + countBlankNodes(child), 0);

/** 게시 가능 여부 (빈칸 검사가 제목 검사보다 먼저) */
export const checkPublishable = (doc: JSONContent): PublishCheck => {
  const count = countBlankNodes(doc);

  if (count > 0) {
    return { status: 'has_blanks', count };
  }

  const title = extractDraftTitle(doc);

  return title ? { status: 'ok', title } : { status: 'no_title' };
};

const isAllowedHref = (href: unknown) => {
  if (typeof href !== 'string') {
    return false;
  }

  try {
    return ALLOWED_LINK_PROTOCOLS.has(new URL(href).protocol);
  } catch {
    return false;
  }
};

// 스키마 spec 에 정의된 속성 키만 남김
const pickAttrs = (
  specAttrs: Record<string, unknown> | undefined,
  attrs: Record<string, unknown> | undefined,
) => {
  if (!specAttrs || !attrs) {
    return undefined;
  }

  const picked = Object.fromEntries(
    Object.keys(specAttrs)
      .filter((key) => key in attrs)
      .map((key) => [key, attrs[key]]),
  );

  return Object.keys(picked).length > 0 ? picked : undefined;
};

const sanitizeMarks = (marks: JSONContent['marks']) => {
  const cleaned = (marks ?? []).flatMap((mark) => {
    const markType = schema.marks[mark.type];

    if (!markType) {
      return [];
    }

    const attrs = pickAttrs(markType.spec.attrs, mark.attrs);

    // 위험한 프로토콜의 링크는 마크만 지우고 글자는 남김
    if (mark.type === 'link' && !isAllowedHref(attrs?.href)) {
      return [];
    }

    return [attrs ? { type: mark.type, attrs } : { type: mark.type }];
  });

  return cleaned.length > 0 ? cleaned : undefined;
};

const sanitizeNode = (node: JSONContent): JSONContent | null => {
  if (node.type === 'text') {
    if (typeof node.text !== 'string' || node.text === '') {
      return null;
    }

    const marks = sanitizeMarks(node.marks);

    return marks
      ? { type: 'text', text: node.text, marks }
      : { type: 'text', text: node.text };
  }

  const nodeType = node.type ? schema.nodes[node.type] : undefined;

  if (!nodeType) {
    return null;
  }

  const attrs = pickAttrs(nodeType.spec.attrs, node.attrs);
  const content = (node.content ?? []).flatMap((child) => {
    const cleaned = sanitizeNode(child);

    return cleaned ? [cleaned] : [];
  });

  return {
    type: node.type,
    ...(attrs ? { attrs } : {}),
    ...(content.length > 0 ? { content } : {}),
  };
};

/**
 * 공개용 본문 정리
 * - 스키마에 없는 노드/마크/속성을 버리고, http·https·mailto 밖의 링크는 마크만 지움
 * - 마지막에 ProseMirror 로 구조를 검증 (맞지 않으면 예외)
 */
export const sanitizePostContent = (doc: JSONContent): JSONContent => {
  const cleaned = sanitizeNode(doc);

  if (!cleaned || cleaned.type !== 'doc') {
    throw new Error('게시할 수 없는 문서입니다.');
  }

  const node = schema.nodeFromJSON(cleaned);

  node.check();

  return node.toJSON() as JSONContent;
};

const getParagraphText = (node: JSONContent): string =>
  node.type === 'text'
    ? (node.text ?? '')
    : (node.content ?? []).map(getParagraphText).join('');

/** 목록용 요약 (최상위 문단 글자만 이어 160자까지, 코드·제목은 건너뜀) */
export const extractPostExcerpt = (doc: JSONContent): string => {
  const text = (doc.content ?? [])
    .filter((node) => node.type === 'paragraph')
    .map((node) => getParagraphText(node).replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ');

  // 서로게이트 쌍이 쪼개지지 않도록 코드 포인트 단위로 자름
  return Array.from(text).slice(0, POST_EXCERPT_MAX_LENGTH).join('').trim();
};
