// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createEditorExtensions } from '@/components/studio/editor-extensions';

const LABELS = {
  headingPlaceholder: '제목',
  paragraphPlaceholder: '내용',
  blankPlaceholder: '여기에 직접 작성',
  codeBlock: { copy: '복사', copied: '복사됨' },
  blank: {
    fill: 'AI 로 다듬기',
    insert: '그대로 넣기',
    remove: '지우기',
    filling: '다듬는 중',
    tooLong: '너무 김',
    kinds: {
      motivation: { label: '계기', fallback: '계기 기본' },
      result: { label: '결과', fallback: '결과 기본' },
      lesson: { label: '배운 점', fallback: '배운 점 기본' },
      detail: { label: '설명', fallback: '설명 기본' },
    },
  },
} as Parameters<typeof createEditorExtensions>[0];

const longText = '가'.repeat(200);

// AI 결과처럼 앞에 긴 본문이 있고 뒤쪽에 빈칸이 있는 문서
const generatedDoc = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: '제목' }],
    },
    ...Array.from({ length: 10 }, () => ({
      type: 'paragraph',
      content: [{ type: 'text', text: longText }],
    })),
    {
      type: 'draftBlank',
      attrs: { kind: 'lesson', hint: '' },
      content: [{ type: 'paragraph' }],
    },
  ],
};

describe('초안 편집기 확장', () => {
  let editor: Editor | undefined;

  afterEach(() => editor?.destroy());

  it('빈 문서를 AI 결과로 통째로 바꿔도 안내 문구 계산이 실패하지 않는다', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: createEditorExtensions(LABELS),
    });

    expect(() =>
      editor!.commands.setContent(generatedDoc, { emitUpdate: false }),
    ).not.toThrow();
  });

  it('빈칸 안 빈 문단의 안내 문구는 빈칸 노드 뷰가 정한다', () => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: createEditorExtensions(LABELS),
      content: generatedDoc,
    });

    const blankDom = editor.view.dom.querySelector<HTMLElement>('[data-kind]');
    const content = blankDom?.querySelector<HTMLElement>(
      '[data-blank-content]',
    );

    expect(blankDom?.style.getPropertyValue('--blank-placeholder')).toBe(
      JSON.stringify('여기에 직접 작성'),
    );
    expect(content).not.toBeNull();
  });
});
