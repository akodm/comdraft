import { CodeBlock } from '@tiptap/extension-code-block';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import {
  createDraftBlankNodeView,
  type DraftBlankLabels,
} from '@/components/studio/draft-blank-node-view';
import {
  createCodeBlockNodeView,
  type CodeBlockLabels,
} from '@/components/studio/code-block-node-view';
import { DraftBlank } from '@/lib/studio/draft-blank-node';
import { createDraftSchemaExtensions } from '@/lib/studio/editor-schema';

interface EditorLabels {
  headingPlaceholder: string;
  paragraphPlaceholder: string;
  codeBlock: CodeBlockLabels;
  blank: DraftBlankLabels;
  blankPlaceholder: string;
}

/**
 * 초안 편집기 확장
 * - 문서 스키마(StarterKit + CodeBlock)는 서버 변환과 공유 (lib/studio/editor-schema.ts)
 * - CodeBlock: 언어 이름 + 복사 버튼을 표시하는 노드 뷰로 교체
 * - DraftBlank: 종류 라벨 + 완료 버튼을 표시하는 노드 뷰로 교체
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
    DraftBlank.extend({
      addNodeView() {
        return createDraftBlankNodeView(labels.blank);
      },
    }),
  ),
  Placeholder.configure({
    // 빈칸 안의 문단도 안내 문구를 보여 주려고 자식 노드까지 포함
    includeChildren: true,
    placeholder: ({ node, editor, pos }) => {
      if (node.type.name === 'heading') {
        return labels.headingPlaceholder;
      }

      return editor.state.doc.resolve(pos).parent.type.name === 'draftBlank'
        ? labels.blankPlaceholder
        : labels.paragraphPlaceholder;
    },
  }),
  Markdown,
];
