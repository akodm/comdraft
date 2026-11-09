import type { AnyExtension } from '@tiptap/core';
import { CodeBlock } from '@tiptap/extension-code-block';
import { StarterKit } from '@tiptap/starter-kit';

/**
 * 초안 문서 스키마를 정하는 확장 (편집기와 서버의 Markdown → 문서 변환이 같은 노드/마크를 쓰도록 공유)
 * - 화면 전용 동작(코드 블록 노드 뷰, 빈 줄 안내 문구)은 components/studio/editor-extensions.ts 에서 덧붙임
 */

// 편집기에서 쓸 수 있는 제목 단계
export const DRAFT_HEADING_LEVELS = [1, 2, 3] as const;

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
];
