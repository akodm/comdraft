import type { JSONContent } from '@tiptap/core';
import { isUuid } from '@/lib/images/rules';

/**
 * 초안 빈칸(draftBlank) 노드의 속성 규칙
 * - 종류 목록과 hint 정리 규칙은 comdraft-lambda 와 똑같이 유지
 */

export const BLANK_KINDS = [
  'motivation',
  'result',
  'lesson',
  'detail',
] as const;

export type BlankKind = (typeof BLANK_KINDS)[number];

export const BLANK_HINT_MAX_LENGTH = 80;

const DEFAULT_BLANK_KIND: BlankKind = 'detail';

const isBlankKind = (value: unknown): value is BlankKind =>
  BLANK_KINDS.includes(value as BlankKind);

// comdraft-lambda src/generation/validate.ts 의 sanitizeHint 와 같은 규칙
const sanitizeHint = (value: unknown) => {
  const cleaned = (typeof value === 'string' ? value : '')
    .replace(/["{}]/g, '')
    // 따옴표 등을 먼저 지운 뒤 콜론 3개 이상 묶음을 통째로 지워 ::: 가 다시 생기지 않게 함
    .replace(/:{3,}/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 서로게이트 쌍이 쪼개지지 않도록 코드 포인트 단위로 자름
  return Array.from(cleaned).slice(0, BLANK_HINT_MAX_LENGTH).join('').trim();
};

export const normalizeBlankAttrs = (
  attrs: Record<string, unknown> | undefined,
): { kind: BlankKind; hint: string } => ({
  kind: isBlankKind(attrs?.kind) ? attrs.kind : DEFAULT_BLANK_KIND,
  hint: sanitizeHint(attrs?.hint),
});

const getTextLength = (node: JSONContent): number =>
  node.type === 'text'
    ? (node.text ?? '').trim().length
    : (node.content ?? []).reduce(
        (sum, child) => sum + getTextLength(child),
        0,
      );

/** 글자가 하나도 없는 빈칸 개수 */
export const countEmptyBlanks = (doc: JSONContent): number => {
  if (doc.type === 'draftBlank') {
    return getTextLength(doc) === 0 ? 1 : 0;
  }

  return (doc.content ?? []).reduce(
    (sum, child) => sum + countEmptyBlanks(child),
    0,
  );
};

const BLANK_NODE = 'draftBlank';

/**
 * id 가 없거나 UUID 가 아니거나 앞에서 이미 쓰인 빈칸에 새 id 를 붙임 (순수 함수, 입력은 바꾸지 않음)
 */
export const ensureBlankIds = (
  doc: JSONContent,
  createId: () => string = () => crypto.randomUUID(),
): JSONContent => {
  const seen = new Set<string>();

  const visit = (node: JSONContent): JSONContent => {
    const content = node.content?.map(visit);
    const next: JSONContent = content ? { ...node, content } : { ...node };

    if (node.type === BLANK_NODE) {
      const current = node.attrs?.id;
      let id = typeof current === 'string' && isUuid(current) ? current : '';

      while (!id || seen.has(id)) {
        id = createId();
      }

      seen.add(id);
      next.attrs = { ...node.attrs, id };
    }

    return next;
  };

  return visit(doc);
};

const getPlainText = (node: JSONContent): string =>
  node.type === 'text'
    ? (node.text ?? '')
    : (node.content ?? []).map(getPlainText).join('\n');

/** 빈칸 안에 적힌 글 (문단은 줄바꿈으로 잇고 앞뒤 공백을 지움, 빈칸 채우기 요청의 답) */
export const getBlankAnswer = (node: JSONContent): string =>
  getPlainText(node).trim();

const findBlankNode = (
  node: JSONContent,
  blankId: string,
): JSONContent | null => {
  if (node.type === BLANK_NODE && node.attrs?.id === blankId) {
    return node;
  }

  for (const child of node.content ?? []) {
    const found = findBlankNode(child, blankId);

    if (found) return found;
  }

  return null;
};

/** id 로 빈칸을 찾아 종류·안내 문구·안에 적힌 글을 돌려줌 (없으면 null) */
export const findBlank = (
  doc: JSONContent,
  blankId: string,
): { kind: string; hint: string; text: string } | null => {
  const node = findBlankNode(doc, blankId);

  if (!node) return null;

  return {
    kind: String(node.attrs?.kind ?? DEFAULT_BLANK_KIND),
    hint: String(node.attrs?.hint ?? ''),
    text: getBlankAnswer(node),
  };
};

/**
 * id 가 맞는 빈칸 하나를 문단들로 바꿈 (순수 함수)
 * - 찾지 못하면 아무것도 바꾸지 않고 원본을 그대로 돌려줌
 */
export const replaceBlank = (
  doc: JSONContent,
  blankId: string,
  paragraphs: JSONContent[],
): { doc: JSONContent; replaced: boolean } => {
  let replaced = false;

  const visit = (node: JSONContent): JSONContent => {
    if (!node.content) return node;

    const content = node.content.flatMap((child) => {
      if (
        !replaced &&
        child.type === BLANK_NODE &&
        child.attrs?.id === blankId
      ) {
        replaced = true;

        return paragraphs;
      }

      return [visit(child)];
    });

    return { ...node, content };
  };

  const next = visit(doc);

  return replaced ? { doc: next, replaced } : { doc, replaced: false };
};

/**
 * 제목(H1)과 빈 문단·빈 제목을 빼고 남는 내용이 있는지
 * - 다시 작성하면 본문이 사라질지 판단할 때 씀
 */
export const hasDraftBody = (doc: JSONContent | null): boolean =>
  (doc?.content ?? []).some((node) => {
    if (node.type === 'heading' && node.attrs?.level === 1) return false;

    if (node.type === 'paragraph' || node.type === 'heading') {
      return getTextLength(node) > 0;
    }

    return true;
  });
