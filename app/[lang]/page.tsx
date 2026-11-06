import PageLayout from '@/components/layout/page-layout';
import DraftExampleSection from '@/components/main/draft-example-section';
import HeroSection from '@/components/main/hero-section';
import MainFooter from '@/components/main/main-footer';
import MainHeader from '@/components/main/main-header';
import NoticeSection from '@/components/main/notice-section';
import StepsSection from '@/components/main/steps-section';
import { getSession } from '@/lib/auth/session';
import { localizedRedirect } from '@/lib/i18n/request';
import { initLingui } from '@/lib/i18n/server';

export default async function Home() {
  await initLingui();
  // 메인은 비로그인 사용자용 소개 페이지라 로그인 사용자는 대시보드로 이동
  // (온보딩을 마치지 않은 사용자는 대시보드에서 다시 온보딩으로 이동)
  const session = await getSession();

  if (session) {
    await localizedRedirect('/dashboard');
  }

  return (
    <PageLayout
      header={<MainHeader isSignedIn={false} />}
      footer={<MainFooter />}
    >
      <HeroSection />
      <StepsSection />
      <DraftExampleSection />
      <NoticeSection />
    </PageLayout>
  );
}
