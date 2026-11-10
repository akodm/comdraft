import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import {
  checkPublishable,
  extractPostExcerpt,
  sanitizePostContent,
} from '@/lib/posts/post-content';

const doc = (...content: JSONContent[]): JSONContent => ({
  type: 'doc',
  content,
});
const text = (value: string): JSONContent => ({ type: 'text', text: value });
const p = (value: string): JSONContent => ({
  type: 'paragraph',
  content: [text(value)],
});
const h = (level: number, value: string): JSONContent => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const link = (value: string, href: string): JSONContent => ({
  type: 'text',
  text: value,
  marks: [{ type: 'link', attrs: { href } }],
});
const blank = (): JSONContent => ({
  type: 'draftBlank',
  attrs: { kind: 'detail', hint: '' },
  content: [{ type: 'paragraph' }],
});
const codeBlock = (language: string, value: string): JSONContent => ({
  type: 'codeBlock',
  attrs: { language },
  content: [text(value)],
});

describe('checkPublishable', () => {
  it('빈칸이 남아 있으면 개수', () => {
    expect(checkPublishable(doc(h(1, '제목'), blank(), blank()))).toEqual({
      status: 'has_blanks',
      count: 2,
    });
  });

  it('채워진 빈칸도 남아 있으면 센다', () => {
    const filled: JSONContent = { ...blank(), content: [p('채움')] };

    expect(checkPublishable(doc(h(1, '제목'), filled))).toEqual({
      status: 'has_blanks',
      count: 1,
    });
  });

  it('빈칸 검사가 제목 검사보다 먼저', () => {
    expect(checkPublishable(doc(blank()))).toEqual({
      status: 'has_blanks',
      count: 1,
    });
  });

  it('제목이 없으면 no_title', () => {
    expect(checkPublishable(doc({ type: 'paragraph' }))).toEqual({
      status: 'no_title',
    });
  });

  it('통과하면 제목', () => {
    expect(checkPublishable(doc(h(1, '제목'), p('본문')))).toEqual({
      status: 'ok',
      title: '제목',
    });
  });
});

describe('sanitizePostContent', () => {
  it('javascript: 링크는 마크만 지우고 글자는 남긴다', () => {
    const out = sanitizePostContent(
      doc({
        type: 'paragraph',
        content: [link('클릭', 'javascript:alert(1)')],
      }),
    );

    expect(out.content?.[0].content?.[0]).toEqual({
      type: 'text',
      text: '클릭',
    });
  });

  it('파싱할 수 없는 href 도 마크를 지운다', () => {
    const out = sanitizePostContent(
      doc({ type: 'paragraph', content: [link('a', '/relative')] }),
    );

    expect(out.content?.[0].content?.[0].marks).toBeUndefined();
  });

  it('http, https, mailto 링크는 유지', () => {
    for (const href of ['http://a.com', 'https://a.com', 'mailto:a@a.com']) {
      const out = sanitizePostContent(
        doc({ type: 'paragraph', content: [link('a', href)] }),
      );

      expect(out.content?.[0].content?.[0].marks?.[0].attrs?.href).toBe(href);
    }
  });

  it('스키마에 없는 노드와 속성은 버린다', () => {
    const out = sanitizePostContent(
      doc(
        { type: 'iframe', attrs: { src: 'x' } },
        {
          type: 'paragraph',
          attrs: { onclick: 'x' },
          content: [text('a')],
        },
      ),
    );

    expect(out).toEqual(doc(p('a')));
  });

  it('정상 문서는 그대로', () => {
    const input = doc(h(2, '제목'), p('본문'), codeBlock('ts', 'const a = 1;'));

    expect(sanitizePostContent(input)).toEqual(input);
  });
});

describe('extractPostExcerpt', () => {
  it('요약은 문단 글자만, 코드·제목 건너뜀', () => {
    expect(
      extractPostExcerpt(
        doc(h(1, '제목'), codeBlock('ts', 'x'), p('첫 문단'), p('둘째')),
      ),
    ).toBe('첫 문단 둘째');
  });

  it('요약 160자 자르기', () => {
    expect(extractPostExcerpt(doc(p('가'.repeat(200))))).toHaveLength(160);
  });

  it('문단이 없으면 빈 값', () => {
    expect(extractPostExcerpt(doc(h(1, '제목')))).toBe('');
  });
});
