import { resolveExtensions, type JSONContent } from '@tiptap/core';
import { MarkdownManager } from '@tiptap/markdown';
import { ensureBlankIds, normalizeBlankAttrs } from '@/lib/studio/draft-blank';
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

// 이미지를 담을 수 없는 글자 블록 (Markdown 의 인라인 이미지가 이 안에 들어옴)
const TEXTBLOCK_TYPES = new Set(['paragraph', 'heading']);

/**
 * 글자 블록 안의 이미지를 그 블록 바로 뒤로 꺼냄 (이미지는 블록 노드라 문단 안에 둘 수 없음)
 * - 이미지만 있던 문단은 빈 문단으로 남겨 목록 항목의 첫 문단 자리를 지킴
 */
const liftImages = (children: JSONContent[]): JSONContent[] =>
  children.flatMap((child) => {
    const inner = child.content ?? [];

    if (
      !TEXTBLOCK_TYPES.has(child.type ?? '') ||
      !inner.some((node) => node.type === 'image')
    ) {
      return [child];
    }

    const block: JSONContent = { ...child };
    const rest = inner.filter((node) => node.type !== 'image');
    const images = inner.filter((node) => node.type === 'image');

    // 이미지만 있던 문단은 content 없이 빈 문단으로
    if (rest.length > 0) {
      block.content = rest;
    } else {
      delete block.content;
    }

    return [block, ...images];
  });

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
 * - 제목 단계는 편집기에서 쓰는 범위(DRAFT_HEADING_LEVELS) 안으로 맞춤 (벗어나면 가장 가까운 단계로)
 * - 안전하지 않은 링크 마크 제거
 * - 문단 안의 이미지는 문단 뒤로 꺼내고, 빈칸 안의 이미지는 버림 (주소 허용 검사는 반영할 때 따로)
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
    normalized.content = liftImages(
      node.content.map(normalizeGeneratedDocument),
    );
  }

  if (node.type === 'draftBlank') {
    const paragraphs = normalized.content?.filter(
      (child) => child.type !== 'image',
    );

    // id 는 ensureBlankIds 가 형식을 검사하므로 그대로 넘김
    normalized.attrs = {
      id: node.attrs?.id,
      ...normalizeBlankAttrs(node.attrs),
    };
    normalized.content =
      paragraphs && paragraphs.length > 0
        ? paragraphs
        : [{ type: 'paragraph' }];
  }

  return normalized;
};

export const markdownToDraftDocument = (markdown: string): JSONContent => {
  const document = getMarkdownManager().parse(markdown);

  // 빈칸마다 고정 id 를 붙여 이후 AI 채우기가 그 빈칸만 찾을 수 있게 함
  return ensureBlankIds(
    normalizeGeneratedDocument(
      document.type === 'doc' ? document : { type: 'doc', content: [document] },
    ),
  );
};
