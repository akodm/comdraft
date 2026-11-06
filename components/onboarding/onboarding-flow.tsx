'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useLingui } from '@lingui/react/macro';
import CompleteStep from '@/components/onboarding/complete-step';
import InstallStep, {
  type OnboardingNotice,
} from '@/components/onboarding/install-step';
import type { OnboardingStep } from '@/components/onboarding/onboarding-step';
import RepositoryStep from '@/components/onboarding/repository-step';
import type { OnboardingRepositoryOption } from '@/components/onboarding/repository-select';
import { completeOnboarding } from '@/lib/actions/onboarding';

interface OnboardingFlowProps {
  initialStep: OnboardingStep;
  repositories: OnboardingRepositoryOption[];
  notice?: OnboardingNotice;
}

/**
 * 온보딩 3단계를 한 화면에서 상태로 전환
 * - 1단계는 GitHub 로 이동했다 돌아오므로 시작 단계는 서버가 진행 상황으로 정함
 * - 뒤로가기는 어느 단계든 온보딩을 마친 것으로 처리하고 대시보드로 이동
 *   (온보딩 전에는 대시보드가 다시 온보딩으로 보내기 때문)
 */
const OnboardingFlow = ({
  initialStep,
  repositories,
  notice,
}: OnboardingFlowProps) => {
  const { t } = useLingui();
  const [step, setStep] = useState(initialStep);

  return (
    <div className="mx-auto flex w-full max-w-120 flex-1 flex-col">
      <form action={completeOnboarding}>
        <button
          type="submit"
          aria-label={t`대시보드로 이동`}
          className="flex size-11 items-center"
        >
          <Image
            src="/images/onboarding/arrow-left.svg"
            alt=""
            width={22}
            height={22}
          />
        </button>
      </form>
      {step === 1 && <InstallStep notice={notice} />}
      {step === 2 && (
        <RepositoryStep
          repositories={repositories}
          onConnected={() => setStep(3)}
        />
      )}
      {step === 3 && <CompleteStep />}
    </div>
  );
};

export default OnboardingFlow;
