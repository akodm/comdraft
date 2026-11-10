// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  applyImageChanges,
  createImageInputExtension,
  shouldPasteFiles,
} from '@/components/studio/editor-images';
import { createDraftSchemaExtensions } from '@/lib/studio/editor-schema';

const BLOB_A = 'blob:http://localhost:3003/a';
const BLOB_B = 'blob:http://localhost:3003/b';
const PUBLIC_SRC =
  'https://x.supabase.co/storage/v1/object/public/comdraft-images/u/0b6a3c7e-0000-4000-8000-000000000000.webp';

const image = (src: string, alt = '') => ({
  type: 'image',
  attrs: { src, alt },
});

const paragraph = (text: string) => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});

const createEditor = (
  content: object,
  isAllowedSrc: (src: string) => boolean = () => true,
) =>
  new Editor({
    element: document.createElement('div'),
    extensions: [
      ...createDraftSchemaExtensions(),
      Markdown,
      createImageInputExtension({ onFiles: vi.fn(), isAllowedSrc }),
    ],
    content,
  });

const imageAttrs = (editor: Editor) => {
  const attrs: Array<Record<string, unknown>> = [];

  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image') {
      attrs.push(node.attrs);
    }
  });

  return attrs;
};

describe('applyImageChanges', () => {
  let editor: Editor | undefined;

  afterEach(() => editor?.destroy());

  it('같은 blob 주소의 이미지를 모두 공개 주소와 크기로 바꾸고 alt 는 둔다', () => {
    editor = createEditor({
      type: 'doc',
      content: [
        image(BLOB_A, 'cat'),
        paragraph('글'),
        { type: 'blockquote', content: [image(BLOB_A, 'cat 2')] },
        image(BLOB_B, 'dog'),
      ],
    });

    applyImageChanges(
      editor,
      new Map([[BLOB_A, { src: PUBLIC_SRC, width: 640, height: 480 }]]),
    );

    expect(imageAttrs(editor)).toEqual([
      { src: PUBLIC_SRC, alt: 'cat', width: 640, height: 480 },
      { src: PUBLIC_SRC, alt: 'cat 2', width: 640, height: 480 },
      { src: BLOB_B, alt: 'dog', width: null, height: null },
    ]);
  });

  it('null 이면 그 이미지를 지우고, 비게 된 인용도 스키마에 맞게 남는다', () => {
    editor = createEditor({
      type: 'doc',
      content: [
        paragraph('앞'),
        image(BLOB_A),
        { type: 'blockquote', content: [image(BLOB_A)] },
        image(BLOB_B),
      ],
    });

    applyImageChanges(editor, new Map([[BLOB_A, null]]));

    expect(imageAttrs(editor).map(({ src }) => src)).toEqual([BLOB_B]);
    expect(() => editor!.state.doc.check()).not.toThrow();
    expect(editor.getText()).toContain('앞');
  });

  it('실행 취소 기록에 남기지 않고, 기본으로는 update 이벤트를 보내지 않는다', () => {
    editor = createEditor({ type: 'doc', content: [paragraph('글')] });
    editor.commands.insertContentAt(
      editor.state.doc.content.size,
      image(BLOB_A),
    );

    const onUpdate = vi.fn();

    editor.on('update', onUpdate);
    applyImageChanges(
      editor,
      new Map([[BLOB_A, { src: PUBLIC_SRC, width: 1, height: 2 }]]),
    );
    expect(onUpdate).not.toHaveBeenCalled();

    // 넣기를 되돌리면 이미지가 빠지고, 다시 실행하면 공개 주소로 돌아온다 (blob 으로 돌아가지 않음)
    editor.commands.undo();
    expect(imageAttrs(editor)).toEqual([]);
    editor.commands.redo();
    expect(imageAttrs(editor).map(({ src }) => src)).toEqual([PUBLIC_SRC]);
  });

  it('emitUpdate 면 update 이벤트를 보낸다', () => {
    editor = createEditor({ type: 'doc', content: [image(BLOB_A)] });

    const onUpdate = vi.fn();

    editor.on('update', onUpdate);
    applyImageChanges(
      editor,
      new Map([[BLOB_A, { src: PUBLIC_SRC, width: 1, height: 2 }]]),
      { emitUpdate: true },
    );

    expect(onUpdate).toHaveBeenCalledTimes(1);
  });

  it('바꿀 이미지가 없으면 아무 트랜잭션도 보내지 않는다', () => {
    editor = createEditor({ type: 'doc', content: [image(BLOB_B)] });

    const onTransaction = vi.fn();

    editor.on('transaction', onTransaction);
    applyImageChanges(editor, new Map([[BLOB_A, null]]));

    expect(onTransaction).not.toHaveBeenCalled();
  });
});

describe('createImageInputExtension', () => {
  let editor: Editor | undefined;

  afterEach(() => editor?.destroy());

  it('붙여넣기 등으로 들어온 허용되지 않는 주소의 이미지는 바로 지운다', () => {
    const isAllowedSrc = (src: string) => src === PUBLIC_SRC || src === BLOB_A;

    editor = createEditor(
      { type: 'doc', content: [paragraph('글')] },
      isAllowedSrc,
    );
    editor.commands.insertContentAt(editor.state.doc.content.size, [
      image('https://example.com/a.png'),
      image(PUBLIC_SRC),
      image('blob:http://other/x'),
      image(BLOB_A),
    ]);

    expect(imageAttrs(editor).map(({ src }) => src)).toEqual([
      PUBLIC_SRC,
      BLOB_A,
    ]);
  });

  it('글자 입력은 그대로 둔다', () => {
    editor = createEditor(
      { type: 'doc', content: [paragraph('글')] },
      () => false,
    );
    editor.commands.insertContent('더');

    expect(editor.getText()).toContain('더');
  });
});

describe('shouldPasteFiles', () => {
  const file = new File(['x'], 'a.png', { type: 'image/png' });

  it('파일이 없으면 기본 붙여넣기', () => {
    expect(shouldPasteFiles([], '')).toBe(false);
  });

  it('파일만 있거나 HTML 에 글자가 없으면(이미지 복사) 파일로 넣는다', () => {
    expect(shouldPasteFiles([file], '')).toBe(true);
    expect(
      shouldPasteFiles(
        [file],
        '<meta charset="utf-8"><img src="https://x/a.png">',
      ),
    ).toBe(true);
  });

  it('글자가 있는 HTML 과 함께면(문서·표 복사) 기본 붙여넣기', () => {
    expect(
      shouldPasteFiles([file], '<table><tr><td>값</td></tr></table>'),
    ).toBe(false);
  });
});

describe('이미지 내보내기', () => {
  let editor: Editor | undefined;

  afterEach(() => editor?.destroy());

  it('HTML 은 img, Markdown 은 ![alt](주소)', () => {
    editor = createEditor({
      type: 'doc',
      content: [
        {
          type: 'image',
          attrs: { src: PUBLIC_SRC, alt: 'cat', width: 640, height: 480 },
        },
      ],
    });

    expect(editor.getHTML()).toBe(
      `<img src="${PUBLIC_SRC}" alt="cat" width="640" height="480">`,
    );
    expect(editor.getMarkdown().trim()).toBe(`![cat](${PUBLIC_SRC})`);
  });

  it('Markdown 대체 글의 [, ], \\ 는 이스케이프해 이미지 문법이 깨지지 않음', () => {
    editor = createEditor({
      type: 'doc',
      content: [image(PUBLIC_SRC, 'a [b] \\ c](x)')],
    });

    expect(editor.getMarkdown().trim()).toBe(
      `![a \\[b\\] \\\\ c\\](x)](${PUBLIC_SRC})`,
    );
  });
});
