// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createDraftBlankNodeView,
  liftDraftBlank,
  type DraftBlankLabels,
} from '@/components/studio/draft-blank-node-view';
import { DraftBlank } from '@/lib/studio/draft-blank-node';
import { createDraftSchemaExtensions } from '@/lib/studio/editor-schema';

const paragraph = (text?: string) => ({
  type: 'paragraph',
  ...(text ? { content: [{ type: 'text', text }] } : {}),
});

const blank = (text?: string) => ({
  type: 'draftBlank',
  attrs: { kind: 'lesson', hint: '' },
  content: [paragraph(text)],
});

describe('draftBlank 편집', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      element: undefined,
      extensions: [...createDraftSchemaExtensions(), Markdown],
    });
  });

  afterEach(() => editor.destroy());

  it('완료하면 빈칸이 풀려 일반 문단만 남는다', () => {
    editor.commands.setContent({ type: 'doc', content: [blank('배운 점')] });

    expect(liftDraftBlank(editor, 0)).toBe(true);
    expect(editor.getJSON().content).toEqual([paragraph('배운 점')]);
  });

  it('글자가 없는 빈칸은 풀리지 않는다', () => {
    editor.commands.setContent({ type: 'doc', content: [blank()] });

    expect(liftDraftBlank(editor, 0)).toBe(false);
    expect(editor.getJSON().content?.[0].type).toBe('draftBlank');
  });

  it('빈칸이 아닌 위치는 false 다', () => {
    editor.commands.setContent({ type: 'doc', content: [paragraph('본문')] });

    expect(liftDraftBlank(editor, 0)).toBe(false);
  });

  it('채운 빈칸은 내용만, 빈 빈칸은 내보내지 않는다', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [blank('배운 점'), blank()],
    });

    // 빈 빈칸이 있던 자리의 블록 구분 줄바꿈은 남을 수 있어 앞뒤 공백은 비교하지 않음
    expect(editor.getMarkdown().trim()).toBe('배운 점');
  });
});

const labels: DraftBlankLabels = {
  kinds: {
    motivation: { label: '계기', fallback: '' },
    result: { label: '결과', fallback: '' },
    lesson: { label: '배운 점', fallback: '' },
    detail: { label: '자세히', fallback: '' },
  },
  done: '완료',
};

describe('draftBlank 노드 뷰 완료 버튼', () => {
  let editor: Editor;

  const doneButton = () =>
    editor.view.dom.querySelector('button') as HTMLButtonElement;

  // 노드 뷰가 편집 가능 여부 변경을 반영할 때까지 기다림
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        ...createDraftSchemaExtensions(
          undefined,
          DraftBlank.extend({
            addNodeView() {
              return createDraftBlankNodeView(labels);
            },
          }),
        ),
        Markdown,
      ],
      content: { type: 'doc', content: [blank('배운 점')] },
    });
  });

  afterEach(() => editor.destroy());

  it('편집할 수 있으면 완료 버튼으로 빈칸을 푼다', () => {
    expect(doneButton().disabled).toBe(false);

    doneButton().click();

    expect(editor.getJSON().content).toEqual([paragraph('배운 점')]);
  });

  it('편집 잠금 중에는 완료 버튼이 비활성이고 눌러도 빈칸이 그대로다', async () => {
    editor.setEditable(false, false);
    await flush();

    expect(doneButton().disabled).toBe(true);

    doneButton().click();

    expect(editor.getJSON().content?.[0].type).toBe('draftBlank');
  });

  it('잠금이 풀리면 완료 버튼이 다시 활성이 된다', async () => {
    editor.setEditable(false, false);
    await flush();
    editor.setEditable(true, false);
    await flush();

    expect(doneButton().disabled).toBe(false);
  });
});
