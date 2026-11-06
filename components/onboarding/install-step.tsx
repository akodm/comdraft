'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Trans } from '@lingui/react/macro';
import {
  OnboardingStepActions,
  OnboardingStepContent,
} from '@/components/onboarding/onboarding-step';
import { GITHUB_BUTTON_CLASS } from '@/components/shared/button-styles';
import LocalizedAnchor from '@/components/shared/localized-anchor';
import Spinner from '@/components/shared/spinner';
import { completeOnboarding } from '@/lib/actions/onboarding';

export interface OnboardingNotice {
  text: string;
  isError: boolean;
}

interface InstallStepProps {
  // GitHub App 설치 후 돌아왔을 때의 안내 (승인 대기, 설치 실패 등)
  notice?: OnboardingNotice;
}

/**
 * 1단계: GitHub App 설치 페이지로 이동해 저장소 권한 승인
 * - 설치를 마치고 돌아오면 서버가 설치 여부를 확인해 2단계부터 표시
 */
const InstallStep = ({ notice }: InstallStepProps) => {
  const [isPending, setIsPending] = useState(false);

  // GitHub 에서 뒤로 가기로 돌아와 bfcache 로 복원된 경우 로딩 해제
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setIsPending(false);
      }
    };

    window.addEventListener('pageshow', handlePageShow);

    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  const handleInstallClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (isPending) {
      event.preventDefault();
      return;
    }

    setIsPending(true);
  };

  return (
    <div className="flex flex-1 flex-col">
      <OnboardingStepContent
        title={
          <Trans>
            Github App 에서
            <br />
            저장소 권한을 승인해주세요.
          </Trans>
        }
      >
        {notice && (
          <p
            role={notice.isError ? 'alert' : 'status'}
            className={`text-[13px] leading-[1.6] ${notice.isError ? 'text-danger' : 'text-ink-muted'}`}
          >
            {notice.text}
          </p>
        )}
      </OnboardingStepContent>
      <OnboardingStepActions step={1}>
        <form action={completeOnboarding}>
          <button
            type="submit"
            className="flex h-9 items-center text-[14px] leading-[normal] text-ink-muted"
          >
            <Trans>나중에 할게요</Trans>
          </button>
        </form>
        <LocalizedAnchor
          href="/api/github/install"
          aria-busy={isPending}
          onClick={handleInstallClick}
          className={GITHUB_BUTTON_CLASS}
        >
          {isPending ? (
            <Spinner label={<Trans>GitHub 로 이동 중...</Trans>} />
          ) : (
            <>
              <Image
                src="/images/main/github-mark.svg"
                alt=""
                width={20}
                height={20}
              />
              <span>
                <Trans>Github App 인증</Trans>
              </span>
            </>
          )}
        </LocalizedAnchor>
      </OnboardingStepActions>
    </div>
  );
};

export default InstallStep;
