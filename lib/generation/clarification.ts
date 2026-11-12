import {
  CLARIFICATION_ANSWER_MAX_LENGTH,
  type GenerationClarification,
  type GenerationClarificationAnswer,
  type GenerationClarificationQuestion,
} from '@/lib/generation/contract';

/**
 * 작성 전 되묻기 값의 형식 검사 (순수 함수, 서버/클라이언트 공용)
 */

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
};

const toQuestion = (value: unknown): GenerationClarificationQuestion | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.question !== 'string' ||
    !isStringArray(value.options)
  ) {
    return null;
  }

  return { id: value.id, question: value.question, options: value.options };
};

const toAnswer = (value: unknown): GenerationClarificationAnswer | null => {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.answer !== 'string'
  ) {
    return null;
  }

  return { id: value.id, answer: value.answer };
};

/**
 * draft_prompt.clarification 에 저장된 값을 읽는다
 * - 형식이 다르면 null, 형식이 어긋난 질문은 버리고 남은 질문이 없으면 null
 */
export const parseStoredClarification = (
  value: unknown,
): GenerationClarification | null => {
  if (
    !isRecord(value) ||
    typeof value.reason !== 'string' ||
    !Array.isArray(value.questions)
  ) {
    return null;
  }

  const questions = value.questions
    .map(toQuestion)
    .filter((q): q is GenerationClarificationQuestion => q !== null);

  if (questions.length === 0) {
    return null;
  }

  let answers: GenerationClarification['answers'] = null;

  if (value.answers === 'skipped') {
    answers = 'skipped';
  } else if (Array.isArray(value.answers)) {
    answers = value.answers
      .map(toAnswer)
      .filter((a): a is GenerationClarificationAnswer => a !== null);
  }

  return { reason: value.reason, questions, answers };
};

/**
 * 작성자가 보낸 답을 검증한다
 * - 하나라도 어긋나면 null (배열이 아님, 형식 오류, 없는 질문 id, 길이 초과·공백뿐인 답, 남은 답이 없음)
 * - 중복 id 는 첫 번째만 남기고, 결과는 질문 순서대로
 */
export const parseClarificationAnswers = (
  input: unknown,
  questions: GenerationClarificationQuestion[],
): GenerationClarificationAnswer[] | null => {
  if (!Array.isArray(input)) {
    return null;
  }

  const questionIds = new Set(questions.map((q) => q.id));
  const byId = new Map<string, string>();

  for (const item of input) {
    const parsed = toAnswer(item);

    if (!parsed || !questionIds.has(parsed.id)) {
      return null;
    }

    const answer = parsed.answer.trim();

    if (
      answer.length === 0 ||
      answer.length > CLARIFICATION_ANSWER_MAX_LENGTH
    ) {
      return null;
    }

    if (!byId.has(parsed.id)) {
      byId.set(parsed.id, answer);
    }
  }

  const answers = questions.flatMap((q) => {
    const answer = byId.get(q.id);

    return answer === undefined ? [] : [{ id: q.id, answer }];
  });

  return answers.length > 0 ? answers : null;
};
