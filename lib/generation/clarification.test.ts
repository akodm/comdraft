import { describe, expect, it } from 'vitest';
import {
  parseClarificationAnswers,
  parseStoredClarification,
} from '@/lib/generation/clarification';

const questions = [
  { id: 'Q1', question: '독자는 누구인가요?', options: ['초보', '숙련'] },
  { id: 'Q2', question: '어떤 톤인가요?', options: [] },
];

describe('parseStoredClarification', () => {
  it('저장된 값을 그대로 읽는다', () => {
    const value = { reason: '방향이 갈립니다', questions, answers: null };

    expect(parseStoredClarification(value)).toEqual(value);
    expect(
      parseStoredClarification({ ...value, answers: 'skipped' })?.answers,
    ).toBe('skipped');
    expect(
      parseStoredClarification({
        ...value,
        answers: [{ id: 'Q1', answer: '초보' }],
      })?.answers,
    ).toEqual([{ id: 'Q1', answer: '초보' }]);
  });

  it('형식이 다르면 null', () => {
    expect(parseStoredClarification(null)).toBeNull();
    expect(parseStoredClarification('x')).toBeNull();
    expect(parseStoredClarification({ reason: 1, questions })).toBeNull();
    expect(
      parseStoredClarification({ reason: 'r', questions: 'x' }),
    ).toBeNull();
  });

  it('형식이 어긋난 질문은 버리고, 남은 질문이 없으면 null', () => {
    const parsed = parseStoredClarification({
      reason: 'r',
      questions: [
        questions[0],
        { id: 'Q2', question: 3, options: [] },
        { id: 'Q3', question: '질문', options: [1] },
      ],
      answers: null,
    });

    expect(parsed?.questions).toEqual([questions[0]]);
    expect(
      parseStoredClarification({
        reason: 'r',
        questions: [{ id: 'Q1', question: 3, options: [] }],
      }),
    ).toBeNull();
    expect(parseStoredClarification({ reason: 'r', questions: [] })).toBeNull();
  });
});

describe('parseClarificationAnswers', () => {
  it('정상 답은 질문 순서대로 돌려준다', () => {
    expect(
      parseClarificationAnswers(
        [
          { id: 'Q2', answer: ' 차분하게 ' },
          { id: 'Q1', answer: '초보' },
        ],
        questions,
      ),
    ).toEqual([
      { id: 'Q1', answer: '초보' },
      { id: 'Q2', answer: '차분하게' },
    ]);
  });

  it('배열이 아니거나 항목 형식이 다르면 null', () => {
    expect(parseClarificationAnswers('x', questions)).toBeNull();
    expect(parseClarificationAnswers([{ id: 'Q1' }], questions)).toBeNull();
    expect(parseClarificationAnswers([null], questions)).toBeNull();
  });

  it('없는 질문 id 는 null', () => {
    expect(
      parseClarificationAnswers([{ id: 'Q9', answer: '답' }], questions),
    ).toBeNull();
  });

  it('공백만 있는 답은 null', () => {
    expect(
      parseClarificationAnswers([{ id: 'Q1', answer: '   ' }], questions),
    ).toBeNull();
  });

  it('500자까지 통과하고 501자는 null', () => {
    expect(
      parseClarificationAnswers(
        [{ id: 'Q1', answer: 'a'.repeat(500) }],
        questions,
      ),
    ).toHaveLength(1);
    expect(
      parseClarificationAnswers(
        [{ id: 'Q1', answer: 'a'.repeat(501) }],
        questions,
      ),
    ).toBeNull();
  });

  it('빈 배열은 null', () => {
    expect(parseClarificationAnswers([], questions)).toBeNull();
  });

  it('중복 id 는 첫 번째만 남긴다', () => {
    expect(
      parseClarificationAnswers(
        [
          { id: 'Q1', answer: '첫째' },
          { id: 'Q1', answer: '둘째' },
        ],
        questions,
      ),
    ).toEqual([{ id: 'Q1', answer: '첫째' }]);
  });
});
