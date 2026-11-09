'use client';

import { useActionState, useId, useRef, useState, type ReactNode } from 'react';
import { Trans } from '@lingui/react/macro';
import type { OnboardingNotice } from '@/components/onboarding/install-step';
import OnboardingSelect from '@/components/onboarding/onboarding-select';
import {
  FIELD_ERROR_CLASS,
  FIELD_LABEL_CLASS,
  OnboardingStepActions,
  OnboardingStepContent,
  type OnboardingStep,
} from '@/components/onboarding/onboarding-step';
import RepositorySelect, {
  type OnboardingRepositoryOption,
} from '@/components/onboarding/repository-select';
import { PRIMARY_BUTTON_CLASS } from '@/components/shared/button-styles';
import Spinner from '@/components/shared/spinner';
import type {
  ConnectRepositoryResult,
  RepositoryBranchesResult,
} from '@/lib/github/repository-selection';

interface SubmitResult extends ConnectRepositoryResult {
  // 오류를 제출한 값 그대로일 때만 보여주기 위해 함께 기억
  repository: string;
  branch: string;
}

// 선택한 저장소의 브랜치 목록 조회 상태 (repository 는 조회한 저장소의 선택 값)
type BranchList =
  | { repository: string; status: 'loading' }
  | { repository: string; status: 'ok'; branches: string[] }
  | { repository: string; status: 'invalid_repository' | 'error' };

interface RepositoryConnectFormProps {
  repositories: OnboardingRepositoryOption[];
  title: ReactNode;
  submitLabel: ReactNode;
  // 온보딩 단계 (지정하면 버튼 아래에 진행 표시)
  step?: OnboardingStep;
  // GitHub App 설치 후 돌아왔을 때의 안내 (승인 대기, 설치 실패 등)
  notice?: OnboardingNotice;
  // 화면별 Server Action (세션 확인, 성공 후 이동이 다름)
  listBranches: (
    installationId: number,
    githubRepoId: number,
  ) => Promise<RepositoryBranchesResult>;
  connect: (formData: FormData) => Promise<ConnectRepositoryResult>;
  // 연동 성공 후 (connect 가 직접 다른 페이지로 이동하면 생략)
  onConnected?: () => void;
}

/**
 * 저장소와 추적할 브랜치를 골라 연동하는 화면 (온보딩 2단계, 대시보드 저장소 추가)
 * - 둘 다 고르면 제출 버튼 활성화
 * - 저장소를 고르면 GitHub 에서 브랜치 목록을 불러와 기본 브랜치를 미리 선택
 */
const RepositoryConnectForm = ({
  repositories,
  title,
  submitLabel,
  step,
  notice,
  listBranches,
  connect,
  onConnected,
}: RepositoryConnectFormProps) => {
  const repositoryLabelId = useId();
  const repositoryErrorId = useId();
  const branchLabelId = useId();
  const branchErrorId = useId();
  const [repositoryValue, setRepositoryValue] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [branchList, setBranchList] = useState<BranchList | null>(null);
  // 저장소를 연달아 바꿨을 때 늦게 도착한 이전 저장소의 응답을 무시하기 위한 요청 번호
  const branchRequestRef = useRef(0);
  const selected = repositories.find(({ value }) => value === repositoryValue);

  const loadBranches = async (repository: OnboardingRepositoryOption) => {
    const requestId = ++branchRequestRef.current;
    const isLatest = () => requestId === branchRequestRef.current;

    setBranch(null);
    setBranchList({ repository: repository.value, status: 'loading' });

    try {
      const result = await listBranches(
        repository.installationId,
        repository.githubRepoId,
      );

      if (!isLatest()) {
        return;
      }

      if (result.status !== 'ok') {
        setBranchList({ repository: repository.value, status: result.status });
        return;
      }

      setBranchList({
        repository: repository.value,
        status: 'ok',
        branches: result.branches,
      });
      setBranch(
        result.branches.includes(result.defaultBranch)
          ? result.defaultBranch
          : (result.branches[0] ?? null),
      );
    } catch {
      if (isLatest()) {
        setBranchList({ repository: repository.value, status: 'error' });
      }
    }
  };

  const handleRepositoryChange = (value: string) => {
    const repository = repositories.find((option) => option.value === value);

    if (!repository || value === repositoryValue) {
      return;
    }

    setRepositoryValue(value);
    void loadBranches(repository);
  };

  const [result, formAction, isPending] = useActionState(
    async (_previous: SubmitResult | null, formData: FormData) => {
      const { status } = await connect(formData);

      if (status === 'connected') {
        onConnected?.();
      }

      return {
        status,
        repository: `${formData.get('installationId')}:${formData.get('githubRepoId')}`,
        branch: String(formData.get('branch') ?? ''),
      };
    },
    null,
  );

  const branchStatus =
    branchList?.repository === repositoryValue ? branchList.status : null;
  const branches = branchList?.status === 'ok' ? branchList.branches : [];
  const hasRepositoryError =
    (result?.status === 'invalid_repository' &&
      result.repository === repositoryValue) ||
    branchStatus === 'invalid_repository';
  const hasBranchError =
    result?.status === 'invalid_branch' && result.branch === branch;
  const canSubmit =
    selected !== undefined && branch !== null && branchStatus === 'ok';

  const branchPlaceholder = (() => {
    if (!selected) {
      return <Trans>저장소를 먼저 선택하세요</Trans>;
    }

    if (branchStatus === 'loading') {
      return <Trans>브랜치 목록을 불러오는 중...</Trans>;
    }

    return <Trans>브랜치를 선택하세요</Trans>;
  })();

  return (
    <form action={formAction} className="flex flex-1 flex-col">
      <OnboardingStepContent title={title}>
        {notice && (
          <p
            role={notice.isError ? 'alert' : 'status'}
            className={`text-[13px] leading-[1.6] ${notice.isError ? 'text-danger' : 'text-ink-muted'}`}
          >
            {notice.text}
          </p>
        )}
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span id={repositoryLabelId} className={FIELD_LABEL_CLASS}>
              <Trans>저장소</Trans>
            </span>
            <RepositorySelect
              labelId={repositoryLabelId}
              options={repositories}
              value={repositoryValue}
              onChange={handleRepositoryChange}
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
            <span id={branchLabelId} className={FIELD_LABEL_CLASS}>
              <Trans>브랜치</Trans>
            </span>
            <OnboardingSelect
              labelId={branchLabelId}
              options={branches.map((name) => ({ value: name, label: name }))}
              value={branch}
              onChange={setBranch}
              placeholder={branchPlaceholder}
              emptyContent={
                <Trans>
                  선택할 수 있는 브랜치가 없습니다. 커밋이 있는 저장소인지
                  확인해주세요.
                </Trans>
              }
              disabled={branchStatus !== 'ok'}
              busy={branchStatus === 'loading'}
              invalid={hasBranchError || branchStatus === 'error'}
              errorId={branchErrorId}
            />
            <input type="hidden" name="branch" value={branch ?? ''} />
            {branchStatus === 'error' && selected && (
              <p id={branchErrorId} role="alert" className={FIELD_ERROR_CLASS}>
                <Trans>브랜치 목록을 불러오지 못했습니다.</Trans>{' '}
                <button
                  type="button"
                  onClick={() => void loadBranches(selected)}
                  className="underline"
                >
                  <Trans>다시 시도</Trans>
                </button>
              </p>
            )}
            {hasBranchError && (
              <p id={branchErrorId} role="alert" className={FIELD_ERROR_CLASS}>
                <Trans>
                  저장소에서 브랜치를 찾을 수 없습니다. 다른 브랜치를
                  선택해주세요.
                </Trans>
              </p>
            )}
          </div>
        </div>
      </OnboardingStepContent>
      <OnboardingStepActions step={step}>
        <button
          type="submit"
          disabled={!canSubmit || isPending}
          aria-busy={isPending}
          className={PRIMARY_BUTTON_CLASS}
        >
          {isPending ? (
            <Spinner label={<Trans>저장소 연동 중...</Trans>} />
          ) : (
            submitLabel
          )}
        </button>
      </OnboardingStepActions>
    </form>
  );
};

export default RepositoryConnectForm;
