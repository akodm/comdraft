import type { JSONContent } from '@tiptap/core';

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
