import Image from 'next/image';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { getStatusMessage } from '@/components/dashboard/status-message';
import PageLayout from '@/components/layout/page-layout';
import RepositoryConnectForm from '@/components/onboarding/repository-connect-form';
import LocalizedLink from '@/components/shared/localized-link';
import {
  connectDashboardRepository,
  listDashboardRepositoryBranches,
} from '@/lib/actions/repositories';
import { requireSession } from '@/lib/auth/session';
import { toRepositoryOptions } from '@/lib/github/repository-selection';
import { loadUserInstallations } from '@/lib/github/user-installations';
import { localizedRedirect } from '@/lib/i18n/request';
import { initLingui } from '@/lib/i18n/server';

interface AddRepositoryPageProps {
  // GitHub App 설치/권한 변경 후 돌아올 때 setup 라우트가 넘겨주는 결과
  searchParams: Promise<{ status?: string }>;
}

/**
 * 대시보드 저장소 추가 (온보딩 2단계 화면 재사용, 헤더/푸터 없음)
 * - 연동하면 대시보드로 이동하고 온보딩 완료 여부는 건드리지 않음
 * - 선택할 저장소가 없으면 드롭다운에서 GitHub App 권한 추가 링크 안내
 */
export default async function AddRepositoryPage({
  searchParams,
}: AddRepositoryPageProps) {
  const i18n = await initLingui();
  const { user } = await requireSession();
  const { status } = await searchParams;
  const { installations, needsReauth } = await loadUserInstallations(user.id);

  if (needsReauth || status === 'github_reauth') {
    return localizedRedirect('/sign-in?error=github_reauth');
  }

  const statusMessage = getStatusMessage(status);

  return (
    <PageLayout className="flex flex-col px-5 pt-6 pc:pt-32">
      <div className="mx-auto flex w-full max-w-120 flex-1 flex-col">
        <LocalizedLink
          href="/dashboard"
          aria-label={i18n._(msg`대시보드로 이동`)}
          className="flex size-11 items-center"
        >
          <Image
            src="/images/onboarding/arrow-left.svg"
            alt=""
            width={22}
            height={22}
          />
        </LocalizedLink>
        <RepositoryConnectForm
          repositories={toRepositoryOptions(installations)}
          title={
            <Trans>
              저장소와 브랜치를
              <br />
              선택하세요.
            </Trans>
          }
          submitLabel={<Trans>연동</Trans>}
          notice={
            statusMessage && {
              text: i18n._(statusMessage.text),
              isError: statusMessage.isError,
            }
          }
          listBranches={listDashboardRepositoryBranches}
          connect={connectDashboardRepository}
        />
      </div>
    </PageLayout>
  );
}
