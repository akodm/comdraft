import type { Metadata } from 'next';
import '@/css/globals.css';

export const metadata: Metadata = {
  title: 'Next App Boilerplate',
  description: 'Next App Boilerplate',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
