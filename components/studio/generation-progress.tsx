'use client';

import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  GENERATION_STEPS,
  type GenerationErrorCode,
} from '@/lib/generation/contract';
import { isJobLocking } from '@/lib/generation/job-state';
import type { GenerationJobView } from '@/lib/generation/jobs';

const STEP_LABELS: Record<
  (typeof GENERATION_STEPS)[number],
  MessageDescriptor
> = {
  1: msg`구분`,
  2: msg`분석`,
  3: msg`작성`,
};

export const GENERATION_ERROR_MESSAGES: Record<
  GenerationErrorCode,
  MessageDescriptor
> = {
  timeout: msg`AI 작성 시간이 초과되었습니다. 다시 시도해주세요.`,
  github_reauth: msg`GitHub 인증이 만료되었습니다. 다시 로그인한 뒤 시도해주세요.`,
  github_unavailable: msg`저장소나 커밋에 접근할 수 없어 작성하지 못했습니다.`,
  llm_failed: msg`AI 작성 중 오류가 발생했습니다. 다시 시도해주세요.`,
  invalid_result: msg`AI 작성 결과를 초안에 반영하지 못했습니다.`,
  runner_unavailable: msg`AI 작성 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.`,
  // TODO(Task 4): 전용 문구로 교체
  quota_exceeded: msg`알 수 없는 오류로 작성하지 못했습니다. 다시 시도해주세요.`,
  internal: msg`알 수 없는 오류로 작성하지 못했습니다. 다시 시도해주세요.`,
};

type StepState = 'done' | 'current' | 'pending';

const getStepState = (step: number, job: GenerationJobView): StepState => {
  if (job.step >= step) {
    return 'done';
  }

  return job.status === 'running' && job.step + 1 === step
    ? 'current'
    : 'pending';
};

const STEP_CLASSES: Record<StepState, string> = {
  done: 'text-ink',
  current: 'font-medium text-brand',
  pending: 'text-ink-subtle',
};

interface GenerationProgressProps {
  job: GenerationJobView;
  onDismiss: () => void;
}

/**
 * [임시 디자인] AI 작성 진행 상태 (구분 → 분석 → 작성) / 실패 안내
 * - 디자인을 받기 전까지 스튜디오의 작은 글씨 스타일에 맞춘 최소 표시
 */
const GenerationProgress = ({ job, onDismiss }: GenerationProgressProps) => {
  const { i18n } = useLingui();

  if (job.status === 'failed') {
    return (
      <div
        role="alert"
        className="flex items-start justify-between gap-3 rounded bg-danger/5 px-3 py-2 text-[11px] leading-[1.6] text-danger pc:text-[12px]"
      >
        <p className="break-keep">
          {i18n._(GENERATION_ERROR_MESSAGES[job.errorCode ?? 'internal'])}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 underline"
        >
          <Trans>닫기</Trans>
        </button>
      </div>
    );
  }

  if (!isJobLocking(job)) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] leading-[normal] pc:text-[12px]"
    >
      <span className="flex items-center gap-1.5 font-medium text-ink">
        <span
          aria-hidden="true"
          className="size-3 animate-spin rounded-full border-2 border-brand border-t-transparent"
        />
        {job.status === 'queued' ? (
          <Trans>AI 작성 대기 중</Trans>
        ) : (
          <Trans>AI 초안 작성 중</Trans>
        )}
      </span>
      <ol className="flex items-center gap-1.5">
        {GENERATION_STEPS.map((step) => {
          const state = getStepState(step, job);

          return (
            <li
              key={step}
              aria-current={state === 'current' ? 'step' : undefined}
              className={`flex items-center gap-1.5 ${STEP_CLASSES[state]}`}
            >
              {step > 1 && (
                <span aria-hidden="true" className="text-ink-subtle">
                  ·
                </span>
              )}
              <span className="font-mono">{step}</span>
              {i18n._(STEP_LABELS[step])}
              {state === 'done' && (
                <span className="sr-only">
                  <Trans>(완료)</Trans>
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default GenerationProgress;
