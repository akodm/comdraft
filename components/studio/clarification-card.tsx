'use client';

import { useId, useState, useTransition } from 'react';
import Image from 'next/image';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import { GENERATION_ERROR_MESSAGES } from '@/components/studio/generation-progress';
import {
  BRAND_BUTTON_CLASS,
  OUTLINE_BUTTON_CLASS,
} from '@/components/studio/studio-styles';
import {
  cancelClarifiedJob,
  resumeClarifiedJob,
} from '@/lib/actions/generation';
import {
  CLARIFICATION_ANSWER_MAX_LENGTH,
  type GenerationClarificationAnswer,
  type GenerationClarificationQuestion,
} from '@/lib/generation/contract';
import type { GenerationJobView } from '@/lib/generation/jobs';
import {
  canSubmitAnswers,
  toClarificationAnswers,
  type ClarificationChoice,
} from '@/lib/studio/clarification-form';

// 직접 입력 보기를 고른 상태 (보기 번호가 아닌 별도 표시)
const CUSTOM = 'custom';

type CardError =
  | 'invalid'
  | 'not_found'
  | 'github_reauth'
  | 'runner_unavailable'
  | 'error';

const CARD_ERROR_MESSAGES: Record<CardError, MessageDescriptor> = {
  invalid: msg`답을 확인해 주세요.`,
  not_found: msg`이미 처리된 질문입니다. 화면을 새로 고쳐 주세요.`,
  github_reauth: GENERATION_ERROR_MESSAGES.github_reauth,
  runner_unavailable: GENERATION_ERROR_MESSAGES.runner_unavailable,
  error: GENERATION_ERROR_MESSAGES.internal,
};

const RADIO_LABEL_CLASS =
  'flex items-start gap-2 rounded border border-line bg-white px-3 py-2 break-keep has-checked:border-brand has-checked:text-brand';

interface QuestionFieldProps {
  question: GenerationClarificationQuestion;
  choice: ClarificationChoice | undefined;
  disabled: boolean;
  onChange: (choice: ClarificationChoice | undefined) => void;
}

// 질문 하나: 보기 라디오 + 직접 입력 (보기가 없으면 입력칸만)
const QuestionField = ({
  question,
  choice,
  disabled,
  onChange,
}: QuestionFieldProps) => {
  const { t } = useLingui();
  const fieldId = useId();
  const hasOptions = question.options.length > 0;
  const isCustom = !hasOptions || choice?.kind === 'custom';
  const text = choice?.kind === 'custom' ? choice.text : '';
  const selected =
    choice?.kind === 'option' ? String(choice.index) : (choice && CUSTOM) || '';

  return (
    <fieldset
      disabled={disabled}
      className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
    >
      <legend className="mb-1.5 font-medium break-keep text-ink">
        <span className="mr-1.5 font-mono">{question.id}</span>
        {question.question}
      </legend>
      {hasOptions && (
        <div className="flex flex-col gap-1.5 pc:flex-row pc:flex-wrap">
          {question.options.map((option, index) => (
            <label key={option} className={RADIO_LABEL_CLASS}>
              <input
                type="radio"
                name={fieldId}
                value={index}
                checked={selected === String(index)}
                onChange={() => onChange({ kind: 'option', index })}
                className="mt-[3px]"
              />
              {option}
            </label>
          ))}
          <label className={RADIO_LABEL_CLASS}>
            <input
              type="radio"
              name={fieldId}
              value={CUSTOM}
              checked={selected === CUSTOM}
              onChange={() => onChange({ kind: 'custom', text })}
              className="mt-[3px]"
            />
            <Trans>직접 입력</Trans>
          </label>
        </div>
      )}
      {isCustom && (
        <div className="flex flex-col gap-1">
          <textarea
            aria-label={t`${question.id} 답 직접 입력`}
            value={text}
            maxLength={CLARIFICATION_ANSWER_MAX_LENGTH}
            rows={2}
            onChange={(event) =>
              onChange({ kind: 'custom', text: event.target.value })
            }
            className="w-full resize-none rounded border border-line bg-white px-3 py-2 text-ink"
          />
          <span className="self-end font-mono text-[11px] text-ink-faint">
            {text.length}/{CLARIFICATION_ANSWER_MAX_LENGTH}
          </span>
        </div>
      )}
    </fieldset>
  );
};

interface ClarificationCardProps {
  job: GenerationJobView;
  // 답하거나 그냥 작성해 작업이 다시 대기열에 들어갔을 때 (진행 표시로 돌아감)
  onResumed: (job: GenerationJobView) => void;
  // 작성을 취소했을 때
  onCancelled: () => void;
}

/**
 * 작성 전 되묻기 질문 카드
 * - 작업이 답변 대기(awaiting_input)일 때 진행 표시 자리에 보임
 * - 질문마다 보기 + 직접 입력으로 답하고, 하나 이상 답하면 "답하고 작성", 답 없이 "그냥 작성", "취소"
 * - 액션이 도는 동안에는 세 버튼을 모두 막음
 */
const ClarificationCard = ({
  job,
  onResumed,
  onCancelled,
}: ClarificationCardProps) => {
  const { i18n } = useLingui();
  const [choices, setChoices] = useState<
    Record<string, ClarificationChoice | undefined>
  >({});
  const [error, setError] = useState<CardError | null>(null);
  const [isPending, startTransition] = useTransition();
  const clarification = job.clarification;
  const questions = clarification?.questions ?? [];
  const answers = toClarificationAnswers(questions, choices);

  const resume = (payload: GenerationClarificationAnswer[] | 'skipped') => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await resumeClarifiedJob({
          jobId: job.id,
          answers: payload,
        });

        if (result.status === 'started') {
          onResumed(result.job);
          return;
        }

        setError(result.status);
      } catch {
        setError('error');
      }
    });
  };

  const cancel = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await cancelClarifiedJob(job.id);

        if (result.status === 'cancelled') {
          onCancelled();
          return;
        }

        setError(result.status);
      } catch {
        setError('error');
      }
    });
  };

  return (
    <section
      aria-label={i18n._(msg`작성 전 질문`)}
      className="flex flex-col gap-3 rounded border border-line bg-surface px-3 py-3 text-[11px] leading-[1.6] pc:text-[12px]"
    >
      <header className="flex flex-col gap-0.5">
        <h3 className="flex items-start gap-1.5 font-medium break-keep text-ink">
          <Image
            src="/images/studio/message-circle-question.svg"
            alt=""
            width={16}
            height={16}
            className="mt-px shrink-0"
          />
          <Trans>글의 방향을 정하려면 조금 더 알려 주세요</Trans>
        </h3>
        {clarification?.reason && (
          <p className="pl-5.5 break-keep text-ink-subtle">
            {clarification.reason}
          </p>
        )}
      </header>
      {questions.map((question) => (
        <QuestionField
          key={question.id}
          question={question}
          choice={choices[question.id]}
          disabled={isPending}
          onChange={(choice) =>
            setChoices((current) => ({ ...current, [question.id]: choice }))
          }
        />
      ))}
      {error && (
        <p role="alert" className="break-keep text-danger">
          {i18n._(CARD_ERROR_MESSAGES[error])}
        </p>
      )}
      <div className="flex flex-col gap-2 pc:flex-row pc:justify-end">
        {questions.length > 0 && (
          <button
            type="button"
            disabled={isPending || !canSubmitAnswers(answers)}
            onClick={() => resume(answers)}
            className={`h-8 ${BRAND_BUTTON_CLASS}`}
          >
            <Trans>답하고 작성</Trans>
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={() => resume('skipped')}
          className={`h-8 ${OUTLINE_BUTTON_CLASS} text-[12px]`}
        >
          <Trans>그냥 작성</Trans>
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={cancel}
          className={`h-8 ${OUTLINE_BUTTON_CLASS} text-[12px]`}
        >
          <Trans>취소</Trans>
        </button>
      </div>
    </section>
  );
};

export default ClarificationCard;
