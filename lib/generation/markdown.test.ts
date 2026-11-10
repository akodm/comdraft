import { getSchema, type JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { markdownToDraftDocument } from '@/lib/generation/markdown';
import { createDraftSchemaExtensions } from '@/lib/studio/editor-schema';

describe('markdownToDraftDocument 빈칸', () => {
  it(':::blank 를 draftBlank 로 읽는다', () => {
    const doc = markdownToDraftDocument(
      '# 제목\n\n:::blank {kind="motivation" hint="계기를 적어 주세요"}\n:::\n\n본문',
    );

    expect(doc.content?.[1]).toMatchObject({
      type: 'draftBlank',
      attrs: { kind: 'motivation', hint: '계기를 적어 주세요' },
      content: [{ type: 'paragraph' }],
    });
  });

  it('잘못된 kind 는 detail 로 바꾼다', () => {
    const doc = markdownToDraftDocument(':::blank {kind="x" hint="h"}\n:::');

    expect(doc.content?.[0].attrs?.kind).toBe('detail');
  });
});

describe('markdownToDraftDocument 이미지', () => {
  const schema = getSchema(createDraftSchemaExtensions());
  const src = 'https://example.com/a.webp';
  const checkSchema = (doc: JSONContent) => schema.nodeFromJSON(doc).check();

  it('한 줄짜리 이미지는 블록 이미지가 된다', () => {
    const doc = markdownToDraftDocument(`![그림](${src})`);

    expect(doc.content?.[0]).toMatchObject({
      type: 'image',
      attrs: { src, alt: '그림' },
    });
    expect(() => checkSchema(doc)).not.toThrow();
  });

  it('문단 안의 이미지는 문단 뒤로 꺼내 스키마에 맞춘다', () => {
    const doc = markdownToDraftDocument(`앞 ![그림](${src}) 뒤`);

    expect(doc.content?.map((node) => node.type)).toEqual([
      'paragraph',
      'image',
    ]);
    expect(() => checkSchema(doc)).not.toThrow();
  });

  it('목록 항목의 이미지는 빈 첫 문단 뒤에 둔다', () => {
    const doc = markdownToDraftDocument(`- ![그림](${src})`);

    expect(doc.content?.[0].content?.[0]).toMatchObject({
      type: 'listItem',
      content: [{ type: 'paragraph' }, { type: 'image' }],
    });
    expect(() => checkSchema(doc)).not.toThrow();
  });

  it('빈칸 안의 이미지는 버린다 (빈칸은 문단만 담음)', () => {
    const doc = markdownToDraftDocument(
      `:::blank {kind="detail" hint="h"}\n앞 ![그림](${src})\n\n![그림](${src})\n:::`,
    );

    expect(JSON.stringify(doc)).not.toContain(src);
    expect(() => checkSchema(doc)).not.toThrow();
  });
});
