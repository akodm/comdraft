import { describe, expect, it } from 'vitest';
import {
  canSubmitAnswers,
  toClarificationAnswers,
} from '@/lib/studio/clarification-form';

const QUESTIONS = [
  { id: 'Q1', question: '독자는 누구인가요?', options: ['입문자', '실무자'] },
  { id: 'Q2', question: '강조할 점은?', options: [] },
  { id: 'Q3', question: '분량은?', options: ['짧게', '길게'] },
];

describe('toClarificationAnswers', () => {
  it('보기를 고르면 그 보기 문장을 답으로 쓴다', () => {
    expect(
      toClarificationAnswers(QUESTIONS, { Q1: { kind: 'option', index: 1 } }),
    ).toEqual([{ id: 'Q1', answer: '실무자' }]);
  });

  it('직접 입력은 앞뒤 공백을 뺀 글을 답으로 쓴다', () => {
    expect(
      toClarificationAnswers(QUESTIONS, {
        Q2: { kind: 'custom', text: '  성능  ' },
      }),
    ).toEqual([{ id: 'Q2', answer: '성능' }]);
  });

  it('직접 입력이 공백뿐이면 제외한다', () => {
    expect(
      toClarificationAnswers(QUESTIONS, {
        Q2: { kind: 'custom', text: '   ' },
      }),
    ).toEqual([]);
  });

  it('범위 밖 보기 번호는 제외한다', () => {
    expect(
      toClarificationAnswers(QUESTIONS, {
        Q1: { kind: 'option', index: 2 },
        Q3: { kind: 'option', index: -1 },
      }),
    ).toEqual([]);
  });

  it('답하지 않은 질문은 제외한다', () => {
    expect(
      toClarificationAnswers(QUESTIONS, {
        Q1: undefined,
        Q3: { kind: 'option', index: 0 },
      }),
    ).toEqual([{ id: 'Q3', answer: '짧게' }]);
  });

  it('질문 순서대로 돌려준다', () => {
    expect(
      toClarificationAnswers(QUESTIONS, {
        Q3: { kind: 'option', index: 1 },
        Q2: { kind: 'custom', text: '속도' },
        Q1: { kind: 'option', index: 0 },
      }).map(({ id }) => id),
    ).toEqual(['Q1', 'Q2', 'Q3']);
  });
});

describe('canSubmitAnswers', () => {
  it('답이 없으면 보낼 수 없다', () => {
    expect(canSubmitAnswers([])).toBe(false);
  });

  it('답이 하나 이상이면 보낼 수 있다', () => {
    expect(canSubmitAnswers([{ id: 'Q1', answer: '입문자' }])).toBe(true);
  });
});
