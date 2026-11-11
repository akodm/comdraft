import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import {
  countEmptyBlanks,
  ensureBlankIds,
  findBlank,
  getBlankAnswer,
  hasDraftBody,
  normalizeBlankAttrs,
  replaceBlank,
} from '@/lib/studio/draft-blank';
import { isUuid } from '@/lib/images/rules';

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

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

const p = (text?: string): JSONContent =>
  text
    ? { type: 'paragraph', content: [{ type: 'text', text }] }
    : { type: 'paragraph' };

const blank = (id: string | null, text?: string, hint = 'h'): JSONContent => ({
  type: 'draftBlank',
  attrs: { id, kind: 'result', hint },
  content: [p(text)],
});

describe('ensureBlankIds', () => {
  it('id 없는 빈칸에 서로 다른 UUID 를 붙이고 입력은 바꾸지 않는다', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [blank(null), blank(null)],
    };
    const snapshot = JSON.stringify(doc);
    const out = ensureBlankIds(doc);
    const [a, b] = out.content!.map((n) => n.attrs?.id as string);

    expect(isUuid(a)).toBe(true);
    expect(isUuid(b)).toBe(true);
    expect(a).not.toBe(b);
    expect(out.content![0].attrs).toMatchObject({ kind: 'result', hint: 'h' });
    expect(JSON.stringify(doc)).toBe(snapshot);
  });

  it('기존 UUID 는 유지하고 UUID 가 아닌 id 는 새로 만든다', () => {
    const out = ensureBlankIds({
      type: 'doc',
      content: [blank(ID_A), blank('not-a-uuid')],
    });

    expect(out.content![0].attrs?.id).toBe(ID_A);
    expect(isUuid(out.content![1].attrs?.id as string)).toBe(true);
  });

  it('같은 id 두 개면 두 번째만 새 id', () => {
    const out = ensureBlankIds(
      { type: 'doc', content: [blank(ID_A), blank(ID_A)] },
      () => ID_B,
    );

    expect(out.content![0].attrs?.id).toBe(ID_A);
    expect(out.content![1].attrs?.id).toBe(ID_B);
  });
});

describe('findBlank', () => {
  it('hint·kind·안 글을 돌려주고 목록 안 빈칸도 찾는다', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [p('항목'), blank(ID_A, '내 답', '계기')],
            },
          ],
        },
      ],
    };

    expect(findBlank(doc, ID_A)).toEqual({
      kind: 'result',
      hint: '계기',
      text: '내 답',
    });
    expect(findBlank(doc, ID_B)).toBeNull();
  });
});

describe('getBlankAnswer', () => {
  it('빈칸 안 문단 글을 줄바꿈으로 잇고 앞뒤 공백을 지운다 (서버가 받는 답과 같은 규칙)', () => {
    const node: JSONContent = {
      type: 'draftBlank',
      attrs: { id: ID_A, kind: 'result', hint: '' },
      content: [p('  첫 줄'), p('둘째 줄 ')],
    };

    expect(getBlankAnswer(node)).toBe('첫 줄\n둘째 줄');
    expect(getBlankAnswer(blank(ID_A))).toBe('');
  });
});

describe('replaceBlank', () => {
  it('대상 빈칸 자리에 문단들이 들어가고 나머지는 그대로', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [p('앞'), blank(ID_A, '답'), blank(ID_B), p('뒤')],
    };
    const { doc: out, replaced } = replaceBlank(doc, ID_A, [
      p('하나'),
      p('둘'),
    ]);

    expect(replaced).toBe(true);
    expect(out.content).toEqual([
      p('앞'),
      p('하나'),
      p('둘'),
      blank(ID_B),
      p('뒤'),
    ]);
  });

  it('목록 안 빈칸도 바꾼다', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [blank(ID_A, 'x')] }],
        },
      ],
    };
    const { doc: out, replaced } = replaceBlank(doc, ID_A, [p('새 글')]);

    expect(replaced).toBe(true);
    expect(out.content![0].content![0].content).toEqual([p('새 글')]);
  });

  it('없는 id 는 replaced false 와 원본', () => {
    const doc: JSONContent = { type: 'doc', content: [blank(ID_A)] };
    const result = replaceBlank(doc, ID_B, [p('x')]);

    expect(result.replaced).toBe(false);
    expect(result.doc).toBe(doc);
  });
});

describe('hasDraftBody', () => {
  const h1: JSONContent = {
    type: 'heading',
    attrs: { level: 1 },
    content: [{ type: 'text', text: '제목' }],
  };

  it('null·빈 문서·제목만(빈 문단 포함)은 false', () => {
    expect(hasDraftBody(null)).toBe(false);
    expect(hasDraftBody({ type: 'doc' })).toBe(false);
    expect(hasDraftBody({ type: 'doc', content: [p()] })).toBe(false);
    expect(hasDraftBody({ type: 'doc', content: [h1] })).toBe(false);
    expect(hasDraftBody({ type: 'doc', content: [h1, p(), p()] })).toBe(false);
  });

  it('문단 글이 있거나 빈칸이 있으면 true', () => {
    expect(hasDraftBody({ type: 'doc', content: [h1, p('본문')] })).toBe(true);
    expect(hasDraftBody({ type: 'doc', content: [h1, blank(ID_A)] })).toBe(
      true,
    );
  });
});
