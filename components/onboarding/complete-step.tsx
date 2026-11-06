import Image from 'next/image';
import { Trans } from '@lingui/react/macro';
import DraftExample from '@/components/onboarding/draft-example';
import {
  OnboardingStepActions,
  OnboardingStepContent,
} from '@/components/onboarding/onboarding-step';
import { PRIMARY_BUTTON_CLASS } from '@/components/shared/button-styles';

// 3단계: 연동 완료 안내와 초안 작성 유도
const CompleteStep = () => {
  return (
    <div className="flex flex-1 flex-col">
      <OnboardingStepContent
        title={
          <Trans>
            첫 저장소 연동이
            <br />
            완료되었습니다.
          </Trans>
        }
      >
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-soft">
            <Image
              src="/images/onboarding/check.svg"
              alt=""
              width={18}
              height={18}
            />
          </span>
          <p className="min-w-0 flex-1 text-[14px] leading-[1.85] text-ink-muted pc:text-[16px]">
            <Trans>지금 바로 AI 초안을 작성해보세요.</Trans>
          </p>
        </div>
        <DraftExample />
      </OnboardingStepContent>
      <OnboardingStepActions step={3}>
        {/* 초안 작성 화면이 아직 없어 동작 없음 */}
        <button type="button" className={PRIMARY_BUTTON_CLASS}>
          <Trans>작성 하러 가기</Trans>
        </button>
      </OnboardingStepActions>
    </div>
  );
};

export default CompleteStep;
