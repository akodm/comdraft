import type { Metadata } from 'next';
import PageLayout from '@/components/layout/page-layout';
import LegalDocumentView from '@/components/legal/legal-document';
import MainFooter from '@/components/main/main-footer';
import MainHeader from '@/components/main/main-header';
import { getSession } from '@/lib/auth/session';
import { getLocale, initLingui } from '@/lib/i18n/server';
import { TERMS_OF_SERVICE } from '@/lib/legal/terms-of-service';
import { TERMS_DESCRIPTION, TERMS_TITLE } from '@/lib/seo/copy';
import { buildStaticPageMetadata } from '@/lib/seo/static-page-metadata';

export async function generateMetadata(): Promise<Metadata> {
  return buildStaticPageMetadata('/terms', TERMS_TITLE, TERMS_DESCRIPTION);
}

/**
 * 이용약관 (헤더·푸터와 본문만, 본문은 언어별 원문)
 */
export default async function TermsPage() {
  await initLingui();
  const locale = await getLocale();
  const session = await getSession();

  return (
    <PageLayout
      header={<MainHeader isSignedIn={Boolean(session)} />}
      footer={<MainFooter />}
    >
      <LegalDocumentView document={TERMS_OF_SERVICE[locale]} locale={locale} />
    </PageLayout>
  );
}
