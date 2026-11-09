import { CodeBlock } from '@tiptap/extension-code-block';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import {
  createCodeBlockNodeView,
  type CodeBlockLabels,
} from '@/components/studio/code-block-node-view';
import { createDraftSchemaExtensions } from '@/lib/studio/editor-schema';

interface EditorLabels {
  headingPlaceholder: string;
  paragraphPlaceholder: string;
  codeBlock: CodeBlockLabels;
}

/**
 * 초안 편집기 확장
 * - 문서 스키마(StarterKit + CodeBlock)는 서버 변환과 공유 (lib/studio/editor-schema.ts)
 * - CodeBlock: 언어 이름 + 복사 버튼을 표시하는 노드 뷰로 교체
 * - Placeholder: 빈 줄 안내 문구
 * - Markdown: MD 내보내기 (editor.getMarkdown)
 */
export const createEditorExtensions = (labels: EditorLabels) => [
  ...createDraftSchemaExtensions(
    CodeBlock.extend({
      addNodeView() {
        return createCodeBlockNodeView(labels.codeBlock);
      },
    }),
  ),
  Placeholder.configure({
    placeholder: ({ node }) =>
      node.type.name === 'heading'
        ? labels.headingPlaceholder
        : labels.paragraphPlaceholder,
  }),
  Markdown,
];
