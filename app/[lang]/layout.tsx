import type { Metadata } from 'next';
import { IBM_Plex_Mono, Noto_Sans_KR } from 'next/font/google';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import LinguiClientProvider from '@/components/providers/lingui-client-provider';
import FloatingLocaleSwitcher from '@/components/shared/floating-locale-switcher';
import { LOCALES } from '@/lib/i18n/config';
import { initLingui } from '@/lib/i18n/server';
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

export const metadata: Metadata = {
  title: 'Next App Boilerplate',
  description: 'Next App Boilerplate',
};

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
