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

const sanitizeHint = (value: unknown) =>
  (typeof value === 'string' ? value : '')
    .replace(/["{}]|:::/g, '')
    .replace(/\s*[\r\n]+\s*/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .slice(0, BLANK_HINT_MAX_LENGTH);

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
