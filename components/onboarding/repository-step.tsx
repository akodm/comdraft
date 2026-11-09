'use client';

import { Trans } from '@lingui/react/macro';
import RepositoryConnectForm from '@/components/onboarding/repository-connect-form';
import type { OnboardingRepositoryOption } from '@/components/onboarding/repository-select';
import {
  connectOnboardingRepository,
  listOnboardingRepositoryBranches,
} from '@/lib/actions/onboarding';

interface RepositoryStepProps {
  repositories: OnboardingRepositoryOption[];
  onConnected: () => void;
}

// 2단계: 저장소와 추적할 브랜치를 골라 연동 (연동하면 3단계로 전환)
const RepositoryStep = ({ repositories, onConnected }: RepositoryStepProps) => {
  return (
    <RepositoryConnectForm
      step={2}
      repositories={repositories}
      title={
        <Trans>
          저장소와 브랜치를
          <br />
          선택하세요.
        </Trans>
      }
      submitLabel={<Trans>다음</Trans>}
      listBranches={listOnboardingRepositoryBranches}
      connect={connectOnboardingRepository}
      onConnected={onConnected}
    />
  );
};

export default RepositoryStep;
