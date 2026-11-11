import type { JSONContent } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import {
  buildBlankContext,
  FILL_TARGET_MARKER,
  fillResultToParagraphs,
  getBlankQuestion,
  parseBlankFillRequest,
} from '@/lib/generation/blank-fill';
import { buildFakeFillMarkdown } from '@/lib/generation/fake-result';
import { MAX_BLANK_ANSWER_LENGTH } from '@/lib/generation/limits';
import type { BlankKind } from '@/lib/studio/draft-blank';

const BLANK_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_ID = '22222222-2222-4222-8222-222222222222';

const DEFAULT_QUESTIONS: Record<BlankKind, string> = {
  motivation: '계기 기본 질문',
  result: '결과 기본 질문',
  lesson: '배운 점 기본 질문',
  detail: '자세히 기본 질문',
};

const getQuestion = (attrs: Record<string, unknown> | undefined) =>
  getBlankQuestion(attrs, DEFAULT_QUESTIONS);

const text = (value: string): JSONContent => ({ type: 'text', text: value });
const paragraph = (value?: string): JSONContent =>
  value ? { type: 'paragraph', content: [text(value)] } : { type: 'paragraph' };
const blank = (
  id: string,
  kind: string,
  hint: string,
  body?: string,
): JSONContent => ({
  type: 'draftBlank',
  attrs: { id, kind, hint },
  content: [paragraph(body)],
});

describe('parseBlankFillRequest', () => {
  const valid = {
    repositoryId: 'repo-1',
    draftId: 'draft-1',
    blankId: BLANK_ID,
    answer: '  성능 문제를 해결하려고  ',
  };

  it('앞뒤 공백을 지운 답과 함께 돌려준다', () => {
    expect(parseBlankFillRequest(valid)).toEqual({
      ...valid,
      answer: '성능 문제를 해결하려고',
    });
  });

  it('답이 비었거나 공백뿐이면 거부한다', () => {
    expect(parseBlankFillRequest({ ...valid, answer: '' })).toBeNull();
    expect(parseBlankFillRequest({ ...valid, answer: ' \n\t ' })).toBeNull();
  });

  it(`답은 ${MAX_BLANK_ANSWER_LENGTH}자까지만 받는다`, () => {
    expect(
      parseBlankFillRequest({
        ...valid,
        answer: 'a'.repeat(MAX_BLANK_ANSWER_LENGTH),
      }),
    ).not.toBeNull();
    expect(
      parseBlankFillRequest({
        ...valid,
        answer: 'a'.repeat(MAX_BLANK_ANSWER_LENGTH + 1),
      }),
    ).toBeNull();
  });

  it('UUID 가 아닌 빈칸 id 는 거부한다', () => {
    expect(
      parseBlankFillRequest({ ...valid, blankId: 'not-a-uuid' }),
    ).toBeNull();
    expect(parseBlankFillRequest({ ...valid, blankId: 1 })).toBeNull();
  });

  it('저장소·초안 id 가 문자열이 아니거나 비면 거부한다', () => {
    expect(parseBlankFillRequest({ ...valid, draftId: null })).toBeNull();
    expect(parseBlankFillRequest({ ...valid, repositoryId: '' })).toBeNull();
    expect(parseBlankFillRequest({ ...valid, answer: 3 })).toBeNull();
    expect(parseBlankFillRequest(null)).toBeNull();
  });
});

describe('getBlankQuestion', () => {
  it('안내 문구가 있으면 그대로, 없으면 종류의 기본 질문', () => {
    expect(getQuestion({ kind: 'lesson', hint: '무엇을 배웠나요?' })).toBe(
      '무엇을 배웠나요?',
    );
    expect(getQuestion({ kind: 'result', hint: '' })).toBe('결과 기본 질문');
    // 목록 밖 종류는 detail
    expect(getQuestion({ kind: 'oops', hint: ' ' })).toBe('자세히 기본 질문');
  });
});

describe('buildBlankContext', () => {
  const doc: JSONContent = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 1 }, content: [text('제목')] },
      paragraph('도입 문단'),
      blank(OTHER_ID, 'motivation', '', '다른 빈칸에 적은 답'),
      paragraph('중간 문단'),
      blank(BLANK_ID, 'lesson', '무엇을 배웠나요?', '대상 빈칸에 적은 답'),
      paragraph('마지막 문단'),
    ],
  };

  it('대상 빈칸 자리는 {{target}} 한 줄, 다른 빈칸은 [빈칸: 질문] 한 줄', () => {
    const context = buildBlankContext(doc, BLANK_ID, {
      locale: 'ko',
      getQuestion,
    });

    expect(context).toBe(
      [
        '# 제목',
        '도입 문단',
        '[빈칸: 계기 기본 질문]',
        '중간 문단',
        FILL_TARGET_MARKER,
        '마지막 문단',
      ].join('\n\n'),
    );
  });

  it('영어 로케일은 [Blank: 질문]', () => {
    const context = buildBlankContext(doc, BLANK_ID, {
      locale: 'en',
      getQuestion,
    });

    expect(context).toContain('[Blank: 계기 기본 질문]');
    expect(context).not.toContain('[빈칸:');
  });

  it('빈칸 안에 적은 답은 본문 스냅숏에 넣지 않는다', () => {
    const context = buildBlankContext(doc, BLANK_ID, {
      locale: 'ko',
      getQuestion,
    });

    expect(context).not.toContain('대상 빈칸에 적은 답');
    expect(context).not.toContain('다른 빈칸에 적은 답');
  });

  it('본문 글에 {{target}} 이 있어도 표시는 대상 자리 한 번만', () => {
    const withMarker: JSONContent = {
      type: 'doc',
      content: [
        paragraph(FILL_TARGET_MARKER),
        paragraph(`앞 ${FILL_TARGET_MARKER} 뒤`),
        {
          type: 'codeBlock',
          attrs: { language: null },
          content: [text(FILL_TARGET_MARKER)],
        },
        blank(BLANK_ID, 'detail', ''),
      ],
    };
    const context = buildBlankContext(withMarker, BLANK_ID, {
      locale: 'ko',
      getQuestion,
    })!;

    expect(context.split(FILL_TARGET_MARKER)).toHaveLength(2);
    expect(
      context.split('\n').filter((line) => line === FILL_TARGET_MARKER),
    ).toHaveLength(1);
    expect(context.endsWith(FILL_TARGET_MARKER)).toBe(true);
  });

  it('대상 빈칸이 없으면 null', () => {
    expect(
      buildBlankContext(doc, '33333333-3333-4333-8333-333333333333', {
        locale: 'ko',
        getQuestion,
      }),
    ).toBeNull();
  });

  it('안내 문구의 Markdown 기호도 그대로 한 줄에 둔다', () => {
    const context = buildBlankContext(
      {
        type: 'doc',
        content: [
          blank(OTHER_ID, 'detail', '왜 *그렇게* 했나요?'),
          blank(BLANK_ID, 'detail', ''),
        ],
      },
      BLANK_ID,
      { locale: 'ko', getQuestion },
    );

    expect(context).toBe(
      `[빈칸: 왜 *그렇게* 했나요?]\n\n${FILL_TARGET_MARKER}`,
    );
  });
});

describe('fillResultToParagraphs', () => {
  it('문단만 남기고 제목·코드·이미지·빈칸·목록은 버린다', () => {
    const paragraphs = fillResultToParagraphs(
      [
        '# 제목',
        '첫 문단 **굵게**',
        '```ts\nconst a = 1;\n```',
        '![그림](https://example.com/a.png)',
        ':::blank {kind="detail" hint="x"}\n:::',
        '- 목록',
        '둘째 문단',
      ].join('\n\n'),
    );

    expect(paragraphs).toEqual([
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '첫 문단 ' },
          { type: 'text', text: '굵게', marks: [{ type: 'bold' }] },
        ],
      },
      { type: 'paragraph', content: [{ type: 'text', text: '둘째 문단' }] },
    ]);
  });

  it('안전하지 않은 링크는 글자만 남긴다', () => {
    const [first] = fillResultToParagraphs('[눌러](javascript:alert(1))');

    expect(JSON.stringify(first)).not.toContain('javascript:');
    expect(first?.content?.[0]).toMatchObject({ type: 'text', text: '눌러' });
  });

  it('문단은 3개까지, 비거나 결과가 없으면 빈 배열', () => {
    expect(fillResultToParagraphs('a\n\nb\n\nc\n\nd')).toHaveLength(3);
    expect(fillResultToParagraphs('')).toEqual([]);
    expect(fillResultToParagraphs(null)).toEqual([]);
    expect(fillResultToParagraphs('# 제목만')).toEqual([]);
  });
});

describe('buildFakeFillMarkdown', () => {
  it('답을 그대로 한 문단으로 (Markdown 기호와 줄바꿈도 글자로)', () => {
    const answer = '# 제목 아님\n\n- 목록 아님 **굵게 아님** [링크](x)';
    const paragraphs = fillResultToParagraphs(buildFakeFillMarkdown(answer));

    expect(paragraphs).toEqual([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '# 제목 아님 - 목록 아님 **굵게 아님** [링크](x)',
          },
        ],
      },
    ]);
  });
});
