import PageLayout from '@/components/layout/page-layout';
import DraftExampleSection from '@/components/main/draft-example-section';
import HeroSection from '@/components/main/hero-section';
import MainFooter from '@/components/main/main-footer';
import MainHeader from '@/components/main/main-header';
import NoticeSection from '@/components/main/notice-section';
import StepsSection from '@/components/main/steps-section';
import { getSession } from '@/lib/auth/session';
import { initLingui } from '@/lib/i18n/server';

export default async function Home() {
  await initLingui();
  // 메인은 공개 페이지라 requireSession 대신 getSession 으로 로그인 여부만 확인
  const session = await getSession();

  return (
    <PageLayout
      header={<MainHeader isSignedIn={session !== null} />}
      footer={<MainFooter />}
    >
      <HeroSection />
      <StepsSection />
      <DraftExampleSection />
      <NoticeSection />
    </PageLayout>
  );
}
