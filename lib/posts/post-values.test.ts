import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { buildPostValues, parsePostVisibility } from '@/lib/posts/post-values';

const text = (value: string): JSONContent => ({ type: 'text', text: value });
const p = (...content: JSONContent[]): JSONContent => ({
  type: 'paragraph',
  content,
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

describe('parsePostVisibility', () => {
  it('공개 범위는 public, unlisted 만', () => {
    expect(parsePostVisibility('public')).toBe('public');
    expect(parsePostVisibility('unlisted')).toBe('unlisted');
    expect(parsePostVisibility('private')).toBeNull();
    expect(parsePostVisibility(undefined)).toBeNull();
  });
});

describe('buildPostValues', () => {
  it('게시 값 조립', () => {
    const content: JSONContent = {
      type: 'doc',
      content: [
        h(1, 'Sharp 최적화'),
        p(text('본문')),
        p(link('x', 'javascript:x')),
      ],
    };
    const values = buildPostValues(content, 'Sharp 최적화', 'ko', 'unlisted');

    expect(values).toMatchObject({
      title: 'Sharp 최적화',
      slug: 'sharp-최적화',
      excerpt: '본문 x',
      visibility: 'unlisted',
      locale: 'ko',
    });
    expect(JSON.stringify(values.content)).not.toContain('javascript:');
  });
});
