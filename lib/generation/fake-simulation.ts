import type { GenerationClarificationQuestion } from '@/lib/generation/contract';

/**
 * [임시] 가짜 작성 실행기의 실패/멈춤/되묻기 흉내 판단 (순수 모듈, 테스트용으로 분리)
 */

export const FAKE_FAIL_KEYWORD = '[fail]';
export const FAKE_STALL_KEYWORD = '[stall]';
export const FAKE_CLARIFY_KEYWORD = '[clarify]';

export type FakeSimulation = 'fail' | 'stall' | 'clarify' | null;

// 가짜 되묻기 (개발용이라 ko 고정). 첫 질문은 보기 있음, 둘째는 직접 입력만
export const FAKE_CLARIFICATION: {
  reason: string;
  questions: GenerationClarificationQuestion[];
} = {
  reason: '글의 독자와 톤에 따라 전혀 다른 글이 될 수 있습니다.',
  questions: [
    {
      id: 'Q1',
      question: '이 글을 읽을 독자는 누구인가요?',
      options: ['팀 동료 개발자', '외부 일반 독자'],
    },
    {
      id: 'Q2',
      question: '꼭 강조하고 싶은 점이 있나요?',
      options: [],
    },
  ],
};

// 요청 문구로 실패/멈춤/되묻기 흉내 여부 판단 (운영 환경에서는 항상 null, 순서: fail → stall → clarify)
export const getFakeSimulation = (
  prompt: string,
  isEnabled = process.env.NODE_ENV !== 'production',
): FakeSimulation => {
  if (!isEnabled) {
    return null;
  }

  if (prompt.includes(FAKE_FAIL_KEYWORD)) {
    return 'fail';
  }

  if (prompt.includes(FAKE_STALL_KEYWORD)) {
    return 'stall';
  }

  return prompt.includes(FAKE_CLARIFY_KEYWORD) ? 'clarify' : null;
};
