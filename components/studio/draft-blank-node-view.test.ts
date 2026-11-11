// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createBlankFillExtension,
  setBlankFillUi,
} from '@/components/studio/draft-blank-fill';
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
  fill: 'AI 로 다듬기',
  insert: '그대로 넣기',
  remove: '지우기',
  filling: 'AI 가 다듬는 중이에요',
  tooLong: '답이 너무 깁니다',
};

const ID_A = '7b0c1e0e-3f5d-4a8e-9a43-2f2f0a6c1d11';
const ID_B = '0f6d3c44-8d27-4b4f-9c1e-6a3d2b1e5f22';

const blankWithId = (id: string, text?: string) => ({
  ...blank(text),
  attrs: { id, kind: 'lesson', hint: '' },
});

describe('draftBlank 노드 뷰 버튼', () => {
  let editor: Editor;
  let filled: string[];

  const blankDoms = () =>
    Array.from(editor.view.dom.querySelectorAll<HTMLElement>('[data-kind]'));

  const button = (label: string, index = 0) =>
    Array.from(blankDoms()[index].querySelectorAll('button')).find(
      (element) => element.textContent === label,
    ) as HTMLButtonElement;

  // 노드 뷰가 편집 가능 여부 변경을 반영할 때까지 기다림
  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(() => {
    filled = [];
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        ...createDraftSchemaExtensions(
          undefined,
          DraftBlank.extend({
            addNodeView() {
              return createDraftBlankNodeView(labels, {
                onFill: (id) => filled.push(id),
              });
            },
          }),
        ),
        createBlankFillExtension(),
        Markdown,
      ],
      content: {
        type: 'doc',
        content: [blankWithId(ID_A, '배운 점'), blankWithId(ID_B, '두 번째')],
      },
    });
  });

  afterEach(() => editor.destroy());

  it('그대로 넣기는 빈칸을 풀고, 지우기는 빈칸을 지운다', () => {
    button('그대로 넣기').click();

    expect(editor.getJSON().content?.[0]).toEqual(paragraph('배운 점'));

    button('지우기').click();

    // 문서 끝에는 편집기가 늘 빈 문단을 둠
    expect(editor.getJSON().content).toEqual([
      paragraph('배운 점'),
      paragraph(),
    ]);
  });

  it('AI 로 다듬기는 그 빈칸 id 로 요청한다', () => {
    button('AI 로 다듬기', 1).click();

    expect(filled).toEqual([ID_B]);
  });

  it('답이 비면 다듬기와 그대로 넣기가 비활성이다', () => {
    editor.commands.setContent({ type: 'doc', content: [blankWithId(ID_A)] });

    expect(button('AI 로 다듬기').disabled).toBe(true);
    expect(button('그대로 넣기').disabled).toBe(true);
    expect(button('지우기').disabled).toBe(false);
  });

  it('답이 1,000자를 넘으면 다듬기가 비활성이고 안내가 보인다', () => {
    editor.commands.setContent({
      type: 'doc',
      content: [blankWithId(ID_A, '가'.repeat(1001))],
    });

    expect(button('AI 로 다듬기').disabled).toBe(true);
    expect(blankDoms()[0].textContent).toContain('답이 너무 깁니다');

    button('AI 로 다듬기').click();
    expect(filled).toEqual([]);
  });

  it('다듬는 중인 빈칸은 버튼을 숨기고 편집할 수 없으며, 다른 빈칸은 다듬기만 막는다', () => {
    setBlankFillUi(editor, { fillingBlankId: ID_A, isBusy: true });

    const [filling, other] = blankDoms();
    const content = filling.querySelector<HTMLElement>('[data-blank-content]');
    const status = filling.querySelector<HTMLElement>('[role="status"]');

    expect(content?.contentEditable).toBe('false');
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toBe('AI 가 다듬는 중이에요');
    expect(button('AI 로 다듬기').parentElement?.hidden).toBe(true);
    expect(other.querySelector('[role="status"]')).toHaveProperty(
      'hidden',
      true,
    );
    expect(button('AI 로 다듬기', 1).disabled).toBe(true);
    expect(button('그대로 넣기', 1).disabled).toBe(false);

    setBlankFillUi(editor, {
      fillingBlankId: null,
      isBusy: false,
      notice: { blankId: ID_A, message: '다듬지 못했습니다' },
    });

    expect(content?.hasAttribute('contenteditable')).toBe(false);
    expect(button('AI 로 다듬기').disabled).toBe(false);
    expect(blankDoms()[0].textContent).toContain('다듬지 못했습니다');
  });

  it('편집 잠금 중에는 버튼이 모두 비활성이고 눌러도 빈칸이 그대로다', async () => {
    editor.setEditable(false, false);
    await flush();

    expect(button('AI 로 다듬기').disabled).toBe(true);
    expect(button('그대로 넣기').disabled).toBe(true);
    expect(button('지우기').disabled).toBe(true);

    button('그대로 넣기').click();
    button('지우기').click();

    expect(editor.getJSON().content?.[0].type).toBe('draftBlank');
  });

  it('잠금이 풀리면 버튼이 다시 활성이 된다', async () => {
    editor.setEditable(false, false);
    await flush();
    editor.setEditable(true, false);
    await flush();

    expect(button('그대로 넣기').disabled).toBe(false);
    expect(button('AI 로 다듬기').disabled).toBe(false);
  });
});
