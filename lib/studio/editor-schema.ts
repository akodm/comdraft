import type { AnyExtension } from '@tiptap/core';
import { CodeBlock } from '@tiptap/extension-code-block';
import { StarterKit } from '@tiptap/starter-kit';
import { DraftBlank } from '@/lib/studio/draft-blank-node';

/**
 * 초안 문서 스키마를 정하는 확장 (편집기와 서버의 Markdown → 문서 변환이 같은 노드/마크를 쓰도록 공유)
 * - 화면 전용 동작(코드 블록 노드 뷰, 빈 줄 안내 문구)은 components/studio/editor-extensions.ts 에서 덧붙임
 */

// 편집기에서 쓸 수 있는 제목 단계 (목차처럼 깊은 제목도 쓰도록 H1~H6 모두)
export const DRAFT_HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

export type DraftHeadingLevel = (typeof DRAFT_HEADING_LEVELS)[number];

export const createDraftSchemaExtensions = (
  codeBlock: AnyExtension = CodeBlock,
): AnyExtension[] => [
  StarterKit.configure({
    codeBlock: false,
    heading: { levels: [...DRAFT_HEADING_LEVELS] },
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    },
  }),
  codeBlock,
  DraftBlank,
];
