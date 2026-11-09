import { describe, expect, it } from 'vitest';
import { markdownToDraftDocument } from '@/lib/generation/markdown';

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
