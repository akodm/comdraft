'use client';

import { Trans, useLingui } from '@lingui/react/macro';
import { Users } from 'lucide-react';
import OnboardingSelect from '@/components/onboarding/onboarding-select';
import Tooltip from '@/components/shared/tooltip';

export interface OnboardingRepositoryOption {
  // `${installationId}:${githubRepoId}` (설치가 달라도 겹치지 않는 선택 값)
  value: string;
  installationId: number;
  githubRepoId: number;
  fullName: string;
  // 다른 사람 계정의 협업 저장소면 소유자 GitHub 아이디, 본인(소속 조직) 저장소면 null
  collaborationOwner: string | null;
}

interface RepositorySelectProps {
  labelId: string;
  options: OnboardingRepositoryOption[];
  value: string | null;
  onChange: (value: string) => void;
  invalid?: boolean;
  errorId?: string;
}

// 협업 저장소 표시 아이콘 (호버하거나 탭하면 소유자 안내 툴팁)
const CollaborationBadge = ({ owner }: { owner: string }) => {
  const { t } = useLingui();

  return (
    <Tooltip
      label={t`${owner} 님의 저장소입니다. 협업자로 등록되어 있어 연동할 수 있습니다.`}
    >
      <span
        role="img"
        aria-label={t`협업 저장소`}
        className="inline-flex shrink-0 text-ink-faint"
      >
        <Users size={14} aria-hidden />
      </span>
    </Tooltip>
  );
};

// 저장소 선택 드롭다운 (협업 저장소도 같은 목록에 아이콘으로 구분해 표시)
const RepositorySelect = ({ options, ...props }: RepositorySelectProps) => {
  return (
    <OnboardingSelect
      {...props}
      options={options.map(({ value, fullName, collaborationOwner }) => ({
        value,
        label: fullName,
        adornment: collaborationOwner ? (
          <CollaborationBadge owner={collaborationOwner} />
        ) : undefined,
      }))}
      placeholder={<Trans>저장소를 선택하세요</Trans>}
      emptyContent={<Trans>선택할 수 있는 저장소가 없습니다.</Trans>}
    />
  );
};

export default RepositorySelect;
