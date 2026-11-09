import { Trans } from '@lingui/react/macro';
import AddRepositoryLink from '@/components/dashboard/add-repository-link';
import EmptyRepositories from '@/components/dashboard/empty-repositories';
import RepositoryList from '@/components/dashboard/repository-list';
import PageLayout from '@/components/layout/page-layout';
import MainFooter from '@/components/main/main-footer';
import MainHeader from '@/components/main/main-header';
import { requireSession } from '@/lib/auth/session';
import { getDashboardRepositoryPage } from '@/lib/dashboard/queries';
import { initLingui } from '@/lib/i18n/server';

export default async function DashboardPage() {
  await initLingui();
  // proxy 의 쿠키 존재 확인과 별개로, 페이지에서 DB 기준 세션 검증
  const { user } = await requireSession();
  const firstPage = await getDashboardRepositoryPage(user.id);
  const firstPageKey = firstPage.repositories.map(({ id }) => id).join(',');

  return (
    <PageLayout
      header={<MainHeader isSignedIn />}
      footer={<MainFooter />}
      className="flex flex-col"
    >
      {firstPage.repositories.length > 0 ? (
        <section className="w-full px-5 pt-8 pb-12 pc:mx-auto pc:max-w-7xl pc:px-0 pc:pt-14 pc:pb-20">
          <h1 className="sr-only">
            <Trans>연동 저장소</Trans>
          </h1>
          <div className="flex flex-col gap-6">
            <div className="flex justify-end">
              <AddRepositoryLink variant="secondary" />
            </div>
            {/* 다시 렌더링된 첫 페이지가 바뀌면(연동/제거 후 복귀) 불러온 목록을 새로 시작 */}
            <RepositoryList key={firstPageKey} initialPage={firstPage} />
          </div>
        </section>
      ) : (
        <EmptyRepositories />
      )}
    </PageLayout>
  );
}
