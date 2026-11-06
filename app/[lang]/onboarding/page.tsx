import { eq } from 'drizzle-orm';
import { getStatusMessage } from '@/components/dashboard/status-message';
import PageLayout from '@/components/layout/page-layout';
import OnboardingFlow from '@/components/onboarding/onboarding-flow';
import type { OnboardingStep } from '@/components/onboarding/onboarding-step';
import type { OnboardingRepositoryOption } from '@/components/onboarding/repository-select';
import { requireOnboardingSession } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { userRepository } from '@/lib/db/schema';
import { loadUserInstallations } from '@/lib/github/user-installations';
import { localizedRedirect } from '@/lib/i18n/request';
import { initLingui } from '@/lib/i18n/server';

interface OnboardingPageProps {
  // GitHub App 설치 후 돌아올 때 setup 라우트가 넘겨주는 결과
  searchParams: Promise<{ status?: string }>;
}

interface OnboardingState {
  step: OnboardingStep;
  repositories: OnboardingRepositoryOption[];
}

// 진행 상황에 맞는 시작 단계 (GitHub 에서 돌아오거나 새로고침해도 이어서 진행)
const loadOnboardingState = async (
  userId: string,
): Promise<OnboardingState> => {
  const [trackedRepository] = await db
    .select({ repositoryId: userRepository.repositoryId })
    .from(userRepository)
    .where(eq(userRepository.userId, userId))
    .limit(1);

  if (trackedRepository) {
    return { step: 3, repositories: [] };
  }

  const { installations, needsReauth } = await loadUserInstallations(userId);

  if (needsReauth) {
    return localizedRedirect('/sign-in?error=github_reauth');
  }

  if (installations.length === 0) {
    return { step: 1, repositories: [] };
  }

  const repositories = installations
    .filter(({ installation }) => !installation.suspended_at)
    .flatMap(({ installation, repositories: installationRepositories }) =>
      installationRepositories.map((repository) => ({
        value: `${installation.id}:${repository.id}`,
        installationId: installation.id,
        githubRepoId: repository.id,
        fullName: repository.full_name,
      })),
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return { step: 2, repositories };
};

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const i18n = await initLingui();
  const { user } = await requireOnboardingSession();
  const { status } = await searchParams;
  const { step, repositories } = await loadOnboardingState(user.id);
  const statusMessage = getStatusMessage(status);

  return (
    <PageLayout className="flex flex-col px-5 pt-6 pc:pt-32">
      <OnboardingFlow
        initialStep={step}
        repositories={repositories}
        notice={
          statusMessage && {
            text: i18n._(statusMessage.text),
            isError: statusMessage.isError,
          }
        }
      />
    </PageLayout>
  );
}
