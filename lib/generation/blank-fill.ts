import type { JSONContent } from '@tiptap/core';
import {
  MAX_BLANK_ANSWER_LENGTH,
  MAX_FILL_PARAGRAPHS,
} from '@/lib/generation/limits';
import {
  draftDocumentToMarkdown,
  markdownToDraftDocument,
} from '@/lib/generation/markdown';
import type { Locale } from '@/lib/i18n/config';
import { isUuid } from '@/lib/images/rules';
import { normalizeBlankAttrs, type BlankKind } from '@/lib/studio/draft-blank';

/**
 * 빈칸 채우기 (순수 함수: 요청 검증, 본문 스냅숏, 결과 → 문단)
 * - 서버/클라이언트 공용이라 서버 전용 모듈을 import 하지 않음
 */

export interface BlankFillRequest {
  repositoryId: string;
  draftId: string;
  blankId: string;
  // 앞뒤 공백을 지운 글쓴이 답
  answer: string;
}

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

// 요청 값 검증 (빈칸 id 는 UUID, 답은 공백을 지우고 1~1,000자, 아니면 null)
export const parseBlankFillRequest = (
  input: unknown,
): BlankFillRequest | null => {
  if (typeof input !== 'object' || input === null) {
    return null;
  }

  const { repositoryId, draftId, blankId, answer } = input as Record<
    string,
    unknown
  >;
  const trimmed = typeof answer === 'string' ? answer.trim() : '';

  if (
    !isNonEmptyString(repositoryId) ||
    !isNonEmptyString(draftId) ||
    typeof blankId !== 'string' ||
    !isUuid(blankId) ||
    !trimmed ||
    trimmed.length > MAX_BLANK_ANSWER_LENGTH
  ) {
    return null;
  }

  return { repositoryId, draftId, blankId, answer: trimmed };
};

// 빈칸 질문: 안내 문구(hint), 비었으면 종류의 기본 질문 (편집기가 빈칸 머리에 보여 주는 문구와 같음)
export const getBlankQuestion = (
  attrs: Record<string, unknown> | undefined,
  defaultQuestions: Record<BlankKind, string>,
) => {
  const { kind, hint } = normalizeBlankAttrs(attrs);

  return hint || defaultQuestions[kind];
};

/**
 * 본문 스냅숏에서 대상 빈칸 자리를 가리키는 표시 (comdraft-lambda 빈칸 채우기와 같은 값)
 */
export const FILL_TARGET_MARKER = '{{target}}';

// 대상이 아닌 빈칸 한 줄의 머리말 (`[빈칸: 질문]`, 영어는 `[Blank: 질문]`)
export const OTHER_BLANK_LABELS: Record<Locale, string> = {
  ko: '빈칸',
  en: 'Blank',
};

export interface BlankContextOptions {
  // 작업 로케일 (결과 글 언어, 다른 빈칸 머리말 언어)
  locale: Locale;
  // 빈칸 속성 → 질문 (보통 getBlankQuestion 에 기본 질문을 묶어 넘김)
  getQuestion: (attrs: Record<string, unknown> | undefined) => string;
}

// 본문 글에 들어 있는 표시는 대상 자리로 오해하지 않도록 중괄호 하나로 줄임
const neutralizeMarker = (node: JSONContent): JSONContent => {
  const next: JSONContent = { ...node };

  if (typeof node.text === 'string') {
    next.text = node.text.replaceAll(FILL_TARGET_MARKER, '{target}');
  }

  if (node.content) {
    next.content = node.content.map(neutralizeMarker);
  }

  return next;
};

/**
 * 빈칸 채우기 작업의 본문 스냅숏 (draft_prompt.blank_context, comdraft-lambda 와의 계약)
 *
 * 형식 (지금 본문 전체를 편집기 MD 내보내기와 같은 직렬화로 바꾼 Markdown):
 * - 대상 빈칸은 정확히 `{{target}}` 한 줄 (FILL_TARGET_MARKER, 본문 전체에서 한 번만)
 * - 다른 빈칸은 안에 적은 글 없이 `[빈칸: <질문>]` 한 줄 (en 로케일은 `[Blank: <질문>]`)
 *   질문은 hint, 비었으면 종류의 기본 질문
 * - 본문 글에 들어 있던 `{{target}}` 은 `{target}` 으로 바꿔 표시가 한 번만 나오게 함
 * - 빈칸이 목록·인용 안에 있으면 그 줄 머리(들여쓰기, `> `)는 Markdown 그대로 남음
 *
 * Markdown 직렬화가 `[`, `*` 등을 이스케이프하므로, 빈칸 자리는 먼저 글자·숫자로만 된
 * 임시 표시 문단으로 바꿔 직렬화한 뒤 그 표시를 위 줄로 바꿈
 * @param doc 빈칸 id 를 정리한 본문 (ensureBlankIds 를 거친 문서)
 * @returns 대상 빈칸이 없으면 null
 */
export const buildBlankContext = (
  doc: JSONContent,
  blankId: string,
  { locale, getQuestion }: BlankContextOptions,
  nonce: string = crypto.randomUUID().replaceAll('-', ''),
): string | null => {
  const lines: string[] = [];
  let hasTarget = false;

  const replaceBlanks = (node: JSONContent): JSONContent => {
    if (node.type === 'draftBlank') {
      const isTarget = !hasTarget && node.attrs?.id === blankId;

      hasTarget ||= isTarget;
      lines.push(
        isTarget
          ? FILL_TARGET_MARKER
          : `[${OTHER_BLANK_LABELS[locale]}: ${getQuestion(node.attrs)}]`,
      );

      return {
        type: 'paragraph',
        content: [
          { type: 'text', text: `cdblank${nonce}x${lines.length - 1}x` },
        ],
      };
    }

    return node.content
      ? { ...node, content: node.content.map(replaceBlanks) }
      : node;
  };

  const replaced = replaceBlanks(neutralizeMarker(doc));

  if (!hasTarget) {
    return null;
  }

  return draftDocumentToMarkdown(replaced).replace(
    new RegExp(`cdblank${nonce}x(\\d+)x`, 'g'),
    (_, index: string) => lines[Number(index)] ?? '',
  );
};

const hasText = (node: JSONContent): boolean =>
  node.type === 'text'
    ? (node.text ?? '').trim().length > 0
    : (node.content ?? []).some(hasText);

/**
 * 빈칸 채우기 결과(Markdown) → 빈칸 자리에 넣을 문단들 (서버 반영과 편집기 반영이 같은 변환을 씀)
 * - 초안 작성 결과와 같은 변환(편집기 스키마 파싱 + 링크·제목·이미지 정리) 뒤 맨 위 문단만 남김
 *   (제목, 코드 블록, 이미지, 빈칸, 목록, 인용 등은 버림)
 * - 글자가 있는 문단만 최대 3개, 변환에 실패하거나 남는 문단이 없으면 빈 배열
 * - JSON 으로 한 번 복사해 일반 객체로 돌려줌 (DB 저장, 서버 액션 응답에 그대로 씀)
 */
export const fillResultToParagraphs = (
  markdown: string | null | undefined,
): JSONContent[] => {
  if (!markdown?.trim()) {
    return [];
  }

  try {
    const paragraphs = (markdownToDraftDocument(markdown).content ?? [])
      .filter((node) => node.type === 'paragraph' && hasText(node))
      .slice(0, MAX_FILL_PARAGRAPHS);

    return JSON.parse(JSON.stringify(paragraphs)) as JSONContent[];
  } catch {
    return [];
  }
};
