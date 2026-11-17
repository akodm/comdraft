import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { serializePromptDocument } from '@/lib/studio/prompt-markdown';

const text = (value: string, marks: string[] = []): JSONContent => ({
  type: 'text',
  text: value,
  ...(marks.length > 0 ? { marks: marks.map((type) => ({ type })) } : {}),
});

const paragraph = (...content: JSONContent[]): JSONContent => ({
  type: 'paragraph',
  ...(content.length > 0 ? { content } : {}),
});

const doc = (...content: JSONContent[]): JSONContent => ({
  type: 'doc',
  content,
});

const item = (...content: JSONContent[]): JSONContent => ({
  type: 'listItem',
  content,
});

describe('serializePromptDocument', () => {
  it('일반 글의 기호는 이스케이프하지 않는다', () => {
    const value = 'snake_case, src/__init__.py, 2*3=6, a < b, [x](y) & `q`';

    expect(serializePromptDocument(doc(paragraph(text(value))))).toBe(value);
  });

  it('문단은 빈 줄로, 줄바꿈은 한 줄로 잇는다', () => {
    expect(
      serializePromptDocument(
        doc(
          paragraph(text('첫 문단')),
          paragraph(text('줄1'), { type: 'hardBreak' }, text('줄2')),
        ),
      ),
    ).toBe('첫 문단\n\n줄1\n줄2');
  });

  it('빈 문단은 버리고 앞뒤 공백을 지운다', () => {
    expect(
      serializePromptDocument(
        doc(paragraph(), paragraph(text('  내용  ')), paragraph(), paragraph()),
      ),
    ).toBe('내용');
    expect(serializePromptDocument(doc(paragraph()))).toBe('');
  });

  it('굵게, 기울임, 인라인 코드를 표시한다', () => {
    expect(
      serializePromptDocument(
        doc(
          paragraph(
            text('중요', ['bold']),
            text(' 그리고 '),
            text('강조', ['italic']),
            text(' '),
            text('my_var', ['code']),
          ),
        ),
      ),
    ).toBe('**중요** 그리고 *강조* `my_var`');
  });

  it('이어지는 굵게 안의 기울임은 한 번만 연다', () => {
    expect(
      serializePromptDocument(
        doc(paragraph(text('a ', ['bold']), text('b', ['bold', 'italic']))),
      ),
    ).toBe('**a *b***');
  });

  it('백틱이 든 인라인 코드는 더 긴 백틱으로 감싼다', () => {
    expect(serializePromptDocument(doc(paragraph(text('a`b', ['code']))))).toBe(
      '`` a`b ``',
    );
  });

  it('글머리 목록과 번호 목록, 중첩 목록을 들여 쓴다', () => {
    expect(
      serializePromptDocument(
        doc(
          {
            type: 'bulletList',
            content: [
              item(paragraph(text('하나'))),
              item(paragraph(text('둘')), {
                type: 'bulletList',
                content: [item(paragraph(text('둘-하나')))],
              }),
            ],
          },
          {
            type: 'orderedList',
            attrs: { start: 3 },
            content: [
              item(paragraph(text('셋'))),
              item(paragraph(text('넷')), paragraph(text('넷 설명'))),
            ],
          },
        ),
      ),
    ).toBe('- 하나\n- 둘\n  - 둘-하나\n\n3. 셋\n4. 넷\n   넷 설명');
  });

  it('코드 블록은 언어와 원문을 그대로 두고, 안에 ``` 가 있으면 더 긴 울타리를 쓴다', () => {
    expect(
      serializePromptDocument(
        doc({
          type: 'codeBlock',
          attrs: { language: 'ts' },
          content: [text('const a_b = 1 * 2;\n<div>')],
        }),
      ),
    ).toBe('```ts\nconst a_b = 1 * 2;\n<div>\n```');
    expect(
      serializePromptDocument(
        doc({ type: 'codeBlock', content: [text('```\nx')] }),
      ),
    ).toBe('````\n```\nx\n````');
  });

  it('인용은 각 줄 앞에 > 를 붙인다', () => {
    expect(
      serializePromptDocument(
        doc({
          type: 'blockquote',
          content: [paragraph(text('첫 줄')), paragraph(text('둘째 줄'))],
        }),
      ),
    ).toBe('> 첫 줄\n>\n> 둘째 줄');
  });

  it('모르는 노드는 안의 글자만 남긴다', () => {
    expect(
      serializePromptDocument(
        doc({ type: 'heading', content: [text('제목')] }),
      ),
    ).toBe('제목');
  });
});
