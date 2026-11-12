import type {
  GenerationClarificationAnswer,
  GenerationClarificationQuestion,
} from '@/lib/generation/contract';

// 질문 카드에서 작성자가 고른 것 (보기 번호 또는 직접 쓴 글)
export type ClarificationChoice =
  | { kind: 'option'; index: number }
  | { kind: 'custom'; text: string };

/**
 * 카드의 선택을 서버로 보낼 답으로 바꿈 (질문 순서대로)
 * - 보기는 그 보기 문장을 그대로 답으로 씀
 * - 직접 입력은 앞뒤 공백을 뺀 글이 비지 않을 때만 답으로 씀
 * - 범위 밖 보기 번호나 답하지 않은 질문은 건너뜀
 */
export const toClarificationAnswers = (
  questions: GenerationClarificationQuestion[],
  choices: Record<string, ClarificationChoice | undefined>,
): GenerationClarificationAnswer[] => {
  const answers: GenerationClarificationAnswer[] = [];

  for (const { id, options } of questions) {
    const choice = choices[id];

    if (!choice) {
      continue;
    }

    const answer =
      choice.kind === 'option' ? options[choice.index] : choice.text.trim();

    if (answer) {
      answers.push({ id, answer });
    }
  }

  return answers;
};

// 답하고 작성은 하나 이상 답해야 보낼 수 있음
export const canSubmitAnswers = (
  answers: GenerationClarificationAnswer[],
): boolean => answers.length > 0;
