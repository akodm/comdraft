import { CodeBlock } from '@tiptap/extension-code-block';
import { Placeholder } from '@tiptap/extensions';
import { Markdown } from '@tiptap/markdown';
import { createBlankFillExtension } from '@/components/studio/draft-blank-fill';
import {
  createDraftBlankNodeView,
  type DraftBlankHandlers,
  type DraftBlankLabels,
} from '@/components/studio/draft-blank-node-view';
import {
  createCodeBlockNodeView,
  type CodeBlockLabels,
} from '@/components/studio/code-block-node-view';
import {
  createImageInputExtension,
  type ImageInputHandlers,
} from '@/components/studio/editor-images';
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
 * - DraftBlank: 종류 라벨 + AI 로 다듬기·그대로 넣기·지우기 버튼을 표시하는 노드 뷰로 교체
 * - 빈칸 다듬기 상태: 다듬는 중인 빈칸 잠금, 빈칸 id 정리 (draft-blank-fill)
 * - Placeholder: 빈 줄 안내 문구
 * - Markdown: MD 내보내기 (editor.getMarkdown)
 * - 이미지 넣기(images 가 있을 때): 파일 붙여넣기·끌어다 놓기, 허용되지 않는 이미지 주소 거르기
 */
export const createEditorExtensions = (
  labels: EditorLabels,
  images?: ImageInputHandlers,
  blankHandlers?: DraftBlankHandlers,
) => [
  ...createDraftSchemaExtensions(
    CodeBlock.extend({
      addNodeView() {
        return createCodeBlockNodeView(labels.codeBlock);
      },
    }),
    DraftBlank.extend({
      addNodeView() {
        return createDraftBlankNodeView(
          { ...labels.blank, placeholder: labels.blankPlaceholder },
          blankHandlers,
        );
      },
    }),
  ),
  Placeholder.configure({
    // 빈칸 안의 문단도 안내 문구를 보여 주려고 자식 노드까지 포함
    // 빈칸 안 문구는 빈칸 노드 뷰가 CSS 변수로 덮어씀 (여기서 부모를 찾으면
    // 이 함수가 새 문서 기준 위치로 불리는 동안 editor.state 는 이전 문서라 위치가 어긋남)
    includeChildren: true,
    placeholder: ({ node }) =>
      node.type.name === 'heading'
        ? labels.headingPlaceholder
        : labels.paragraphPlaceholder,
  }),
  Markdown,
  createBlankFillExtension(),
  ...(images ? [createImageInputExtension(images)] : []),
];
