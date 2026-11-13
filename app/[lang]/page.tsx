import type { Metadata } from 'next';
import PageLayout from '@/components/layout/page-layout';
import DraftExampleSection from '@/components/main/draft-example-section';
import HeroSection from '@/components/main/hero-section';
import MainFooter from '@/components/main/main-footer';
import MainHeader from '@/components/main/main-header';
import NoticeSection from '@/components/main/notice-section';
import StepsSection from '@/components/main/steps-section';
import { getSession } from '@/lib/auth/session';
import { localizedRedirect } from '@/lib/i18n/request';
import { getLocale, initLingui } from '@/lib/i18n/server';
import { getSiteOrigin } from '@/lib/posts/metadata';
import { SITE_DESCRIPTION, SITE_TITLE } from '@/lib/seo/copy';
import { serializeJsonLd } from '@/lib/seo/json-ld';
import { buildWebsiteOpenGraph } from '@/lib/seo/open-graph';
import { SITE_NAME } from '@/lib/seo/site';
import { buildLocalizedAlternates } from '@/lib/seo/urls';

/**
 * 메인(서비스 소개) 메타데이터: 제목은 사이트 전체 제목, 언어별 대표 주소와 hreflang
 */
export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();
  const locale = await getLocale();
  const origin = getSiteOrigin();
  const alternates = origin
    ? buildLocalizedAlternates(origin, '/', locale)
    : undefined;

  return {
    alternates,
    openGraph: buildWebsiteOpenGraph({
      locale,
      title: i18n._(SITE_TITLE),
      description: i18n._(SITE_DESCRIPTION),
      url: alternates?.canonical,
    }),
  };
}

export default async function Home() {
  const i18n = await initLingui();
  // 메인은 비로그인 사용자용 소개 페이지라 로그인 사용자는 대시보드로 이동
  // (온보딩을 마치지 않은 사용자는 대시보드에서 다시 온보딩으로 이동)
  const session = await getSession();

  if (session) {
    await localizedRedirect('/dashboard');
  }

  const locale = await getLocale();
  const origin = getSiteOrigin();
  // 검색 결과의 사이트 이름 (schema.org WebSite)
  const websiteJsonLd = origin && {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: `${origin}/${locale}`,
    description: i18n._(SITE_DESCRIPTION),
    inLanguage: locale,
  };

  return (
    <PageLayout
      header={<MainHeader isSignedIn={false} />}
      footer={<MainFooter />}
    >
      {websiteJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteJsonLd) }}
        />
      )}
      <HeroSection />
      <StepsSection />
      <DraftExampleSection />
      <NoticeSection />
    </PageLayout>
  );
}
