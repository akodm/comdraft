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

  // comdraft-lambda src/generation/validate.ts 의 sanitizeHint 와 같은 규칙
  it('따옴표·중괄호를 먼저 지운 뒤 콜론 3개 이상 묶음을 지우고 탭까지 공백 한 칸으로', () => {
    const { hint } = normalizeBlankAttrs({ hint: ':"::a ::::b\tc' });

    expect(hint).not.toContain(':::');
    expect(hint).not.toContain('\t');
    expect(hint).toBe('a b c');
  });

  it('80자 자르기는 코드 포인트 단위라 서로게이트 쌍을 쪼개지 않는다', () => {
    const { hint } = normalizeBlankAttrs({ hint: 'x'.repeat(79) + '😀😀' });

    expect(Array.from(hint)).toHaveLength(80);
    expect(hint.endsWith('😀')).toBe(true);
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
