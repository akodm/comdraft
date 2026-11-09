// @vitest-environment happy-dom
import { Editor } from '@tiptap/core';
import { Markdown } from '@tiptap/markdown';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { liftDraftBlank } from '@/components/studio/draft-blank-node-view';
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
