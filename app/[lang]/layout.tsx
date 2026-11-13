import type { Metadata } from 'next';
import { IBM_Plex_Mono, Noto_Sans_KR } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import LinguiClientProvider from '@/components/providers/lingui-client-provider';
import FloatingLocaleSwitcher from '@/components/shared/floating-locale-switcher';
import { LOCALES } from '@/lib/i18n/config';
import { getLocale, initLingui } from '@/lib/i18n/server';
import { getSiteOrigin } from '@/lib/posts/metadata';
import { SITE_DESCRIPTION, SITE_TITLE } from '@/lib/seo/copy';
import { SITE_KEYWORDS, SITE_NAME } from '@/lib/seo/site';
import { buildWebsiteOpenGraph } from '@/lib/seo/open-graph';
import '@/css/globals.css';

// 본문 글꼴 (한글 글리프는 unicode-range 로 나뉜 파일을 필요할 때만 내려받음)
const notoSansKr = Noto_Sans_KR({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-noto-sans-kr',
});

// 코드, 커밋 해시, 로고 글꼴
const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
});

// 지원 로케일 외의 [lang] 값은 404 (proxy 가 로케일 없는 경로를 리다이렉트하므로 정상 흐름에서는 도달하지 않음)
export const dynamicParams = false;

export const generateStaticParams = () => {
  return LOCALES.map((lang) => ({ lang }));
};

/**
 * 모든 페이지의 기본 메타데이터 (언어별)
 * - 제목은 `{페이지 제목} | comdraft`, 제목을 정하지 않은 페이지(메인)는 전체 제목
 * - 절대 주소 기준(metadataBase)은 운영 주소(BETTER_AUTH_URL)
 * - 오픈그래프 이미지는 같은 세그먼트의 opengraph-image 가 채움
 */
export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();
  const locale = await getLocale();
  const origin = getSiteOrigin();
  const title = i18n._(SITE_TITLE);
  const description = i18n._(SITE_DESCRIPTION);

  return {
    ...(origin ? { metadataBase: new URL(origin) } : {}),
    applicationName: SITE_NAME,
    title: { default: title, template: `%s | ${SITE_NAME}` },
    description,
    keywords: SITE_KEYWORDS[locale],
    openGraph: buildWebsiteOpenGraph({ locale, title, description }),
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const i18n = await initLingui();

  return (
    <html
      lang={i18n.locale}
      className={`${notoSansKr.variable} ${ibmPlexMono.variable}`}
    >
      <body className="bg-white font-sans text-ink">
        {/* I18n 인스턴스는 직렬화할 수 없어 로케일과 메시지만 넘기고 클라이언트에서 다시 생성 */}
        <LinguiClientProvider
          initialLocale={i18n.locale}
          initialMessages={i18n.messages}
        >
          <FloatingLocaleSwitcher />
          {children}
        </LinguiClientProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
