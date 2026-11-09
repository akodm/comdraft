import { CodeBlock } from '@tiptap/extension-code-block';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { StarterKit } from '@tiptap/starter-kit';
import {
  createCodeBlockNodeView,
  type CodeBlockLabels,
} from '@/components/studio/code-block-node-view';

interface EditorLabels {
  headingPlaceholder: string;
  paragraphPlaceholder: string;
  codeBlock: CodeBlockLabels;
}

/**
 * 초안 편집기 확장
 * - StarterKit: 문단/제목/목록/인용/굵게/기울임/취소선/인라인 코드/링크/실행 취소 등 기본 노드와 마크
 * - CodeBlock: 언어 이름 + 복사 버튼을 표시하는 노드 뷰로 교체
 * - Placeholder: 빈 줄 안내 문구
 * - Markdown: MD 내보내기 (editor.getMarkdown)
 */
export const createEditorExtensions = (labels: EditorLabels) => [
  StarterKit.configure({
    codeBlock: false,
    heading: { levels: [1, 2, 3] },
    link: {
      openOnClick: false,
      autolink: true,
      defaultProtocol: 'https',
      HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
    },
  }),
  CodeBlock.extend({
    addNodeView() {
      return createCodeBlockNodeView(labels.codeBlock);
    },
  }),
  Placeholder.configure({
    placeholder: ({ node }) =>
      node.type.name === 'heading'
        ? labels.headingPlaceholder
        : labels.paragraphPlaceholder,
  }),
  Markdown,
];
