import { resolveExtensions, type JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import {
  createDraftSchemaExtensions,
  DRAFT_HEADING_LEVELS,
} from '@/lib/studio/editor-schema';

/**
 * 작성 결과(Markdown) → 초안 문서(Tiptap JSON)
 * - 편집기와 같은 스키마 확장으로 파싱해 제목 단계, 코드 언어, 링크를 그대로 유지
 * - DOM 없이 동작하므로 서버에서 변환
 */

const MAX_HEADING_LEVEL = Math.max(...DRAFT_HEADING_LEVELS);

// 문서에 남길 수 있는 링크 (javascript: 등은 링크를 빼고 글자만 남김)
const SAFE_LINK_PATTERN = /^(https?:|mailto:)/i;

let markdownManager: MarkdownManager | null = null;

const getMarkdownManager = () => {
  markdownManager ??= new MarkdownManager({
    extensions: resolveExtensions(createDraftSchemaExtensions()),
  });

  return markdownManager;
};

const normalizeMarks = (marks: JSONContent['marks']) => {
  const safeMarks = marks?.filter(
    (mark) =>
      mark.type !== 'link' ||
      SAFE_LINK_PATTERN.test(String(mark.attrs?.href ?? '')),
  );

  return safeMarks && safeMarks.length > 0 ? safeMarks : undefined;
};

/**
 * 생성된 문서를 편집기 스키마에 맞게 정리 (순수 함수)
 * - 편집기에서 쓰지 않는 제목 단계(H4~H6)는 가장 작은 제목 단계로
 * - 안전하지 않은 링크 마크 제거
 */
export const normalizeGeneratedDocument = (node: JSONContent): JSONContent => {
  const normalized: JSONContent = { ...node };

  if (node.type === 'heading') {
    const level = Number(node.attrs?.level) || 1;

    normalized.attrs = {
      ...node.attrs,
      level: Math.min(Math.max(level, 1), MAX_HEADING_LEVEL),
    };
  }

  if (node.marks) {
    normalized.marks = normalizeMarks(node.marks);
  }

  if (node.content) {
    normalized.content = node.content.map(normalizeGeneratedDocument);
  }

  return normalized;
};

export const markdownToDraftDocument = (markdown: string): JSONContent => {
  const document = getMarkdownManager().parse(markdown);

  return normalizeGeneratedDocument(
    document.type === 'doc' ? document : { type: 'doc', content: [document] },
  );
};
