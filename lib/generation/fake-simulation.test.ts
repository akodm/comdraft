import { describe, expect, it } from 'vitest';
import {
  FAKE_CLARIFICATION,
  getFakeSimulation,
} from '@/lib/generation/fake-simulation';

describe('getFakeSimulation', () => {
  it('[clarify] 가 있으면 개발 환경에서 clarify 를 돌려준다', () => {
    expect(getFakeSimulation('글 써줘 [clarify]', true)).toBe('clarify');
  });

  it('운영 환경에서는 null 이다', () => {
    expect(getFakeSimulation('[clarify]', false)).toBeNull();
  });

  it('확인 순서는 fail, stall, clarify 이다', () => {
    expect(getFakeSimulation('[clarify][fail]', true)).toBe('fail');
    expect(getFakeSimulation('[clarify][stall]', true)).toBe('stall');
  });
});

describe('FAKE_CLARIFICATION', () => {
  it('첫 질문은 보기 2개, 둘째 질문은 직접 입력만 둔다', () => {
    const [first, second] = FAKE_CLARIFICATION.questions;

    expect(first.id).toBe('Q1');
    expect(first.options).toHaveLength(2);
    expect(second.id).toBe('Q2');
    expect(second.options).toEqual([]);
  });
});
