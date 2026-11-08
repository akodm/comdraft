'use client';

import { Trans } from '@lingui/react/macro';
import OnboardingSelect from '@/components/onboarding/onboarding-select';
import LocalizedAnchor from '@/components/shared/localized-anchor';

export interface OnboardingRepositoryOption {
  // `${installationId}:${githubRepoId}` (설치가 달라도 겹치지 않는 선택 값)
  value: string;
  installationId: number;
  githubRepoId: number;
  fullName: string;
}

interface RepositorySelectProps {
  labelId: string;
  options: OnboardingRepositoryOption[];
  value: string | null;
  onChange: (value: string) => void;
  invalid?: boolean;
  errorId?: string;
}

// 저장소 선택 드롭다운 (선택할 저장소가 없으면 GitHub App 권한 추가 링크 안내)
const RepositorySelect = ({ options, ...props }: RepositorySelectProps) => {
  return (
    <OnboardingSelect
      {...props}
      options={options.map(({ value, fullName }) => ({
        value,
        label: fullName,
      }))}
      placeholder={<Trans>저장소를 선택하세요</Trans>}
      emptyContent={
        <Trans>
          선택할 수 있는 저장소가 없습니다.{' '}
          <LocalizedAnchor
            href="/api/github/install"
            className="text-ink underline"
          >
            GitHub App 에서 저장소 권한 추가하기
          </LocalizedAnchor>
        </Trans>
      }
    />
  );
};

export default RepositorySelect;
