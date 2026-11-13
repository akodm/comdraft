import type { Metadata } from 'next';
import { initLingui } from '@/lib/i18n/server';
import { DASHBOARD_TITLE } from '@/lib/seo/copy';
import { NOINDEX } from '@/lib/seo/site';

// 대시보드와 스튜디오: 로그인한 사용자 화면이라 검색에서 뺌 (화면 구성은 각 페이지가 맡음)
export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();

  return { title: i18n._(DASHBOARD_TITLE), robots: NOINDEX };
}

export default function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
