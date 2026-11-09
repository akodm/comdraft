import { describe, expect, it } from 'vitest';
import {
  countEmptyBlanks,
  normalizeBlankAttrs,
} from '@/lib/studio/draft-blank';

describe('normalizeBlankAttrs', () => {
  it('목록 밖 kind 는 detail 로, hint 는 정리해 80자로', () => {
    expect(normalizeBlankAttrs({ kind: 'oops', hint: 'a"b{c}\n:::d' })).toEqual(
      { kind: 'detail', hint: 'abc d' },
    );
    expect(
      normalizeBlankAttrs({ kind: 'lesson', hint: 'x'.repeat(100) }).hint,
    ).toHaveLength(80);
  });
});

describe('countEmptyBlanks', () => {
  it('글자가 없는 빈칸만 센다', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'draftBlank',
          attrs: { kind: 'detail', hint: '' },
          content: [{ type: 'paragraph' }],
        },
        {
          type: 'draftBlank',
          attrs: { kind: 'lesson', hint: '' },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: '배움' }] },
          ],
        },
      ],
    };

    expect(countEmptyBlanks(doc)).toBe(1);
  });
});
