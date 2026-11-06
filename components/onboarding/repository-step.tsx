'use client';

import { useActionState, useId, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  FIELD_CLASS,
  FIELD_ERROR_CLASS,
  FIELD_LABEL_CLASS,
  OnboardingStepActions,
  OnboardingStepContent,
} from '@/components/onboarding/onboarding-step';
import RepositorySelect, {
  type OnboardingRepositoryOption,
} from '@/components/onboarding/repository-select';
import { PRIMARY_BUTTON_CLASS } from '@/components/shared/button-styles';
import Spinner from '@/components/shared/spinner';
import {
  connectOnboardingRepository,
  type ConnectOnboardingRepositoryResult,
} from '@/lib/actions/onboarding';

interface SubmitResult extends ConnectOnboardingRepositoryResult {
  // 오류를 제출한 값 그대로일 때만 보여주기 위해 함께 기억
  repository: string;
  branch: string;
}

interface RepositoryStepProps {
  repositories: OnboardingRepositoryOption[];
  onConnected: () => void;
}

// 2단계: 저장소와 추적할 브랜치를 골라 연동 (둘 다 채우면 다음 버튼 활성화)
const RepositoryStep = ({ repositories, onConnected }: RepositoryStepProps) => {
  const { t } = useLingui();
  const repositoryLabelId = useId();
  const repositoryErrorId = useId();
  const branchInputId = useId();
  const branchErrorId = useId();
  const [repositoryValue, setRepositoryValue] = useState<string | null>(null);
  const [branch, setBranch] = useState('');
  const selected = repositories.find(({ value }) => value === repositoryValue);

  const [result, formAction, isPending] = useActionState(
    async (_previous: SubmitResult | null, formData: FormData) => {
      const { status } = await connectOnboardingRepository(formData);

      if (status === 'connected') {
        onConnected();
      }

      return {
        status,
        repository: `${formData.get('installationId')}:${formData.get('githubRepoId')}`,
        branch: String(formData.get('branch') ?? ''),
      };
    },
    null,
  );

  const hasRepositoryError =
    result?.status === 'invalid_repository' &&
    result.repository === repositoryValue;
  const hasBranchError =
    result?.status === 'invalid_branch' && result.branch === branch;
  const canSubmit = selected !== undefined && branch.trim() !== '';

  return (
    <form action={formAction} className="flex flex-1 flex-col">
      <OnboardingStepContent
        title={
          <Trans>
            저장소를 선택하고
            <br />
            브랜치명을 입력하세요.
          </Trans>
        }
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span id={repositoryLabelId} className={FIELD_LABEL_CLASS}>
              <Trans>저장소</Trans>
            </span>
            <RepositorySelect
              labelId={repositoryLabelId}
              options={repositories}
              value={repositoryValue}
              onChange={setRepositoryValue}
              invalid={hasRepositoryError}
              errorId={repositoryErrorId}
            />
            <input
              type="hidden"
              name="installationId"
              value={selected?.installationId ?? ''}
            />
            <input
              type="hidden"
              name="githubRepoId"
              value={selected?.githubRepoId ?? ''}
            />
            {hasRepositoryError && (
              <p
                id={repositoryErrorId}
                role="alert"
                className={FIELD_ERROR_CLASS}
              >
                <Trans>
                  접근 권한이 없거나 설치에 포함되지 않은 저장소입니다.
                </Trans>
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <label htmlFor={branchInputId} className={FIELD_LABEL_CLASS}>
              <Trans>브랜치명</Trans>
            </label>
            <input
              id={branchInputId}
              name="branch"
              value={branch}
              onChange={(event) => setBranch(event.target.value)}
              placeholder={t`브랜치명을 입력하세요`}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-invalid={hasBranchError}
              aria-describedby={hasBranchError ? branchErrorId : undefined}
              className={`${FIELD_CLASS} placeholder:text-ink-faint focus:border-ink`}
            />
            {hasBranchError && (
              <p id={branchErrorId} role="alert" className={FIELD_ERROR_CLASS}>
                <Trans>
                  저장소에서 브랜치를 찾을 수 없습니다. 브랜치명을 확인해주세요.
                </Trans>
              </p>
            )}
          </div>
        </div>
      </OnboardingStepContent>
      <OnboardingStepActions step={2}>
        <button
          type="submit"
          disabled={!canSubmit || isPending}
          aria-busy={isPending}
          className={PRIMARY_BUTTON_CLASS}
        >
          {isPending ? (
            <Spinner label={<Trans>저장소 연동 중...</Trans>} />
          ) : (
            <Trans>다음</Trans>
          )}
        </button>
      </OnboardingStepActions>
    </form>
  );
};

export default RepositoryStep;
