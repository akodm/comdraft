import { renderToStaticMarkup } from 'react-dom/server';
import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import PostContent from '@/components/posts/post-content';

const text = (value: string, marks?: JSONContent['marks']): JSONContent => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});
const p = (...content: JSONContent[]): JSONContent => ({
  type: 'paragraph',
  content,
});
const h = (level: number, value: string): JSONContent => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const codeBlock = (language: string, value: string): JSONContent => ({
  type: 'codeBlock',
  attrs: { language },
  content: [text(value)],
});
const link = (value: string, href: string) =>
  text(value, [{ type: 'link', attrs: { href } }]);
const doc = (...content: JSONContent[]): JSONContent => ({
  type: 'doc',
  content,
});

describe('PostContent', () => {
  it('제목, 코드 블록, 링크를 그린다', () => {
    const html = renderToStaticMarkup(
      <PostContent
        content={doc(
          h(2, '소제목'),
          codeBlock('ts', 'const a = 1;'),
          p(link('문서', 'https://a.com')),
        )}
      />,
    );

    expect(html).toContain('<h2');
    expect(html).toContain('const a = 1;');
    expect(html).toContain('href="https://a.com"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });
});
