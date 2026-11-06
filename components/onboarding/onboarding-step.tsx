import type { ReactNode } from 'react';
import { Trans } from '@lingui/react/macro';

export type OnboardingStep = 1 | 2 | 3;

const STEP_COUNT = 3;

export const FIELD_LABEL_CLASS = 'text-[14px] leading-5.5 font-medium text-ink';

export const FIELD_CLASS =
  'h-13 w-full rounded border border-line bg-white px-4 text-[14px] leading-[normal] text-ink outline-none focus-visible:border-ink aria-invalid:border-danger pc:text-[15px]';

export const FIELD_ERROR_CLASS = 'text-[13px] leading-[1.6] text-danger';

interface OnboardingStepContentProps {
  title: ReactNode;
  children?: ReactNode;
}

// 단계 제목과 본문
export const OnboardingStepContent = ({
  title,
  children,
}: OnboardingStepContentProps) => {
  return (
    <div className="flex flex-col gap-8 pt-15 pc:gap-10 pc:pt-26">
      <h1 className="min-h-29.25 text-[26px] leading-[1.4] font-bold tracking-[-1px] break-keep text-ink pc:min-h-27.5 pc:text-[36px] pc:tracking-[-1.4px]">
        {title}
      </h1>
      {children}
    </div>
  );
};

// 진행 표시 (클릭 동작 없음)
const StepDots = ({ step }: { step: OnboardingStep }) => {
  const total = STEP_COUNT;

  return (
    <div className="flex h-3 items-center gap-3">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={`rounded-full ${index + 1 === step ? 'size-3 bg-brand' : 'size-2 bg-line'}`}
        />
      ))}
      <span className="sr-only">
        <Trans>
          {total}단계 중 {step}단계
        </Trans>
      </span>
    </div>
  );
};

interface OnboardingStepActionsProps {
  step: OnboardingStep;
  children: ReactNode;
}

// 화면 아래에 붙는 단계 행동 버튼과 진행 표시 (내용이 길면 내용 아래로 밀려남)
export const OnboardingStepActions = ({
  step,
  children,
}: OnboardingStepActionsProps) => {
  return (
    <div className="mt-auto flex flex-col items-center gap-10 pt-10 pb-10 pc:gap-18 pc:pb-16">
      <div className="flex w-full flex-col items-center gap-4">{children}</div>
      <StepDots step={step} />
    </div>
  );
};
