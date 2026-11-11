// @vitest-environment happy-dom
import { Editor, type JSONContent } from '@tiptap/core';
import type { DecorationSet } from '@tiptap/pm/view';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assignBlankIds,
  createBlankFillExtension,
  getBlankFillUi,
  readBlankFillView,
  removeDraftBlank,
  replaceBlankWithParagraphs,
  setBlankFillUi,
} from '@/components/studio/draft-blank-fill';
import { isUuid } from '@/lib/images/rules';
import { createDraftSchemaExtensions } from '@/lib/studio/editor-schema';

const ID_A = '7b0c1e0e-3f5d-4a8e-9a43-2f2f0a6c1d11';
const ID_B = '0f6d3c44-8d27-4b4f-9c1e-6a3d2b1e5f22';

const paragraph = (text?: string): JSONContent => ({
  type: 'paragraph',
  ...(text ? { content: [{ type: 'text', text }] } : {}),
});

const blank = (id: string | null, text?: string): JSONContent => ({
  type: 'draftBlank',
  attrs: { id, kind: 'lesson', hint: '' },
  content: [paragraph(text)],
});

const blankIds = (editor: Editor) =>
  (editor.getJSON().content ?? [])
    .filter((node) => node.type === 'draftBlank')
    .map((node) => node.attrs?.id as string);

describe('빈칸 다듬기 편집기 확장', () => {
  let editor: Editor;

  beforeEach(() => {
    editor = new Editor({
      element: document.createElement('div'),
      extensions: [
        ...createDraftSchemaExtensions(),
        createBlankFillExtension(),
      ],
      content: {
        type: 'doc',
        content: [paragraph('앞 문단'), blank(ID_A, '내 답'), paragraph('끝')],
      },
    });
  });

  afterEach(() => editor.destroy());

  describe('빈칸 id', () => {
    it('열 때 id 가 없는 빈칸에 UUID 를 붙인다', () => {
      // 처음 만든 편집기 내용은 변경 트랜잭션이 없어 assignBlankIds 로 붙임
      const created = new Editor({
        element: document.createElement('div'),
        extensions: [
          ...createDraftSchemaExtensions(),
          createBlankFillExtension(),
        ],
        content: { type: 'doc', content: [blank(null, '답'), blank(ID_A)] },
      });

      expect(assignBlankIds(created)).toBe(true);

      const [first, second] = blankIds(created);

      expect(isUuid(first)).toBe(true);
      expect(second).toBe(ID_A);
      expect(assignBlankIds(created)).toBe(false);
      created.destroy();
    });

    it('붙여 넣은 빈칸이 원래 빈칸과 같은 id 면 붙여 넣은 쪽만 새 id 를 받는다', () => {
      // 원래 빈칸 앞에 같은 id 의 빈칸을 넣음 (복사해 붙여 넣기와 같음)
      editor.commands.insertContentAt(0, blank(ID_A, '복사본'));

      const content = (editor.getJSON().content ?? []) as JSONContent[];
      const copy = content[0];
      const original = content.find(
        (node, index) => index > 0 && node.type === 'draftBlank',
      );

      expect(original?.attrs?.id).toBe(ID_A);
      expect(original?.content?.[0].content?.[0].text).toBe('내 답');
      expect(isUuid(copy.attrs?.id)).toBe(true);
      expect(copy.attrs?.id).not.toBe(ID_A);
    });

    it('id 없이 들어온 빈칸에도 id 를 붙인다', () => {
      editor.commands.insertContentAt(0, blank(null, '새 빈칸'));

      const [first, second] = blankIds(editor);

      expect(isUuid(first)).toBe(true);
      expect(second).toBe(ID_A);
    });
  });

  describe('다듬는 중 잠금', () => {
    const blankView = () => {
      const decorations = editor.view.someProp('decorations', (f) =>
        f(editor.state),
      );
      const found =
        (decorations as DecorationSet | undefined)?.find(
          0,
          editor.state.doc.content.size,
        ) ?? [];

      return readBlankFillView(found);
    };

    it('상태를 바꾸면 빈칸 장식에 다듬는 중·다듬기 막음·안내가 실린다', () => {
      setBlankFillUi(editor, { fillingBlankId: ID_A, isBusy: true });

      expect(getBlankFillUi(editor.state).fillingBlankId).toBe(ID_A);
      expect(blankView()).toEqual({ filling: true, busy: true, notice: null });

      setBlankFillUi(editor, {
        fillingBlankId: null,
        isBusy: false,
        notice: { blankId: ID_A, message: '실패' },
      });

      expect(blankView()).toEqual({
        filling: false,
        busy: false,
        notice: '실패',
      });
    });

    it('다듬는 빈칸 안을 바꾸거나 지우는 변경은 막고, 다른 곳은 편집할 수 있다', () => {
      setBlankFillUi(editor, { fillingBlankId: ID_A, isBusy: true });

      const before = editor.getJSON();
      // 빈칸 안 글자 사이 (앞 문단 6 + 빈칸 여는 위치 1 + 문단 여는 위치 1 + 글자 2)
      editor.commands.insertContentAt(10, '추가');
      expect(editor.getJSON()).toEqual(before);

      editor.commands.selectAll();
      editor.commands.deleteSelection();
      expect(editor.getJSON()).toEqual(before);

      editor.commands.insertContentAt(1, '맨 ');
      expect(editor.getJSON().content?.[0]).toEqual(paragraph('맨 앞 문단'));
    });

    it('잠긴 빈칸도 결과를 넣을 수 있고, 실행 취소하면 답이 돌아온다', () => {
      setBlankFillUi(editor, { fillingBlankId: ID_A, isBusy: true });

      expect(
        replaceBlankWithParagraphs(editor, ID_A, [
          paragraph('다듬은 첫 문단'),
          paragraph('다듬은 둘째 문단'),
        ]),
      ).toBe(true);
      expect(editor.getJSON().content).toEqual([
        paragraph('앞 문단'),
        paragraph('다듬은 첫 문단'),
        paragraph('다듬은 둘째 문단'),
        paragraph('끝'),
      ]);

      editor.commands.undo();

      expect(blankIds(editor)).toEqual([ID_A]);
    });

    it('id 가 맞는 빈칸이 없으면 아무것도 바꾸지 않는다', () => {
      const before = editor.getJSON();

      expect(
        replaceBlankWithParagraphs(editor, ID_B, [paragraph('결과')]),
      ).toBe(false);
      expect(editor.getJSON()).toEqual(before);
    });
  });

  it('지우기는 빈칸을 통째로 지우고 실행 취소로 되돌린다', () => {
    expect(removeDraftBlank(editor, 6)).toBe(true);
    expect(editor.getJSON().content).toEqual([
      paragraph('앞 문단'),
      paragraph('끝'),
    ]);

    editor.commands.undo();

    expect(blankIds(editor)).toEqual([ID_A]);
    expect(removeDraftBlank(editor, 0)).toBe(false);
  });
});
