import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import {
  buildPostOutline,
  getTocHeadings,
  toHeadingSlug,
} from '@/lib/posts/post-outline';

const doc = (...content: JSONContent[]): JSONContent => ({
  type: 'doc',
  content,
});
const text = (value: string): JSONContent => ({ type: 'text', text: value });
const p = (value: string): JSONContent => ({
  type: 'paragraph',
  content: [text(value)],
});
const h = (level: number, ...content: JSONContent[]): JSONContent => ({
  type: 'heading',
  attrs: { level },
  content,
});

describe('toHeadingSlug', () => {
  it('글자·숫자는 남기고 공백은 -, 기호는 뺀다', () => {
    expect(toHeadingSlug('Next.js 16 시작하기!')).toBe('nextjs-16-시작하기');
    expect(toHeadingSlug('  A  _ b -- c  ')).toBe('a-b-c');
  });

  it('남는 글자가 없으면 기본 id 를 쓴다', () => {
    expect(toHeadingSlug('?!')).toBe('section');
    expect(toHeadingSlug('')).toBe('section');
  });
});

describe('buildPostOutline', () => {
  it('제목에 문서 순서대로 id 를 붙이고 목록을 뽑는다', () => {
    const { content, headings } = buildPostOutline(
      doc(h(2, text('소개')), p('본문'), h(3, text('설치 방법'))),
    );

    expect(headings).toEqual([
      { id: '소개', level: 2, text: '소개' },
      { id: '설치-방법', level: 3, text: '설치 방법' },
    ]);
    expect(content.content?.[0]?.attrs).toEqual({ level: 2, id: '소개' });
    expect(content.content?.[2]?.attrs).toEqual({ level: 3, id: '설치-방법' });
  });

  it('같은 글자의 제목은 뒤에 번호를 붙여 겹치지 않게 한다', () => {
    const { headings } = buildPostOutline(
      doc(h(2, text('예시')), h(2, text('예시')), h(3, text('예시'))),
    );

    expect(headings.map(({ id }) => id)).toEqual(['예시', '예시-1', '예시-2']);
  });

  it('줄바꿈은 공백으로, 인용문 안의 제목도 포함한다', () => {
    const { headings } = buildPostOutline(
      doc({
        type: 'blockquote',
        content: [h(2, text('첫째'), { type: 'hardBreak' }, text('둘째'))],
      }),
    );

    expect(headings).toEqual([
      { id: '첫째-둘째', level: 2, text: '첫째 둘째' },
    ]);
  });

  it('원본 문서는 바꾸지 않는다', () => {
    const original = doc(h(2, text('제목')));
    const snapshot = structuredClone(original);

    buildPostOutline(original);

    expect(original).toEqual(snapshot);
  });

  it('본문이 같으면 항상 같은 id 를 만든다', () => {
    const source = doc(h(2, text('A')), h(2, text('A')));

    expect(buildPostOutline(source)).toEqual(buildPostOutline(source));
  });
});

describe('getTocHeadings', () => {
  const heading = (level: number, value: string) => ({
    id: value,
    level,
    text: value,
  });

  it('H1 과 글자 없는 제목은 빼고 H2 이하만 남긴다', () => {
    expect(
      getTocHeadings([
        heading(1, '글 제목'),
        heading(2, '소개'),
        heading(3, '세부'),
        heading(2, ''),
      ]),
    ).toEqual([heading(2, '소개'), heading(3, '세부')]);
  });

  it('H2 가 없으면 빈 목록이다', () => {
    expect(getTocHeadings([heading(1, '제목'), heading(3, '세부')])).toEqual(
      [],
    );
    expect(getTocHeadings([])).toEqual([]);
  });
});
