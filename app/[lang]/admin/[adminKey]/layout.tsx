import type { Metadata } from 'next';
import { forbidden } from 'next/navigation';
import { msg } from '@lingui/core/macro';
import { matchesAdminKey } from '@/lib/admin/path-key';
import { initLingui } from '@/lib/i18n/server';
import { NOINDEX } from '@/lib/seo/site';

const ADMIN_TITLE = msg`어드민`;

interface AdminKeyLayoutProps {
  children: React.ReactNode;
  params: Promise<{ lang: string; adminKey: string }>;
}

/**
 * 어드민 화면 공통 메타데이터
 * - 검색에서 뺌
 * - 리퍼러는 출처(도메인)만 보냄: 어드민에서 나가는 이동·요청에 주소 키가 담긴 전체 주소가 실리지 않게
 *   ('no-referrer' 는 같은 사이트 POST 의 Origin 까지 null 로 만들어 서버 액션이 거부되므로 쓰지 않음)
 */
export async function generateMetadata(): Promise<Metadata> {
  const i18n = await initLingui();

  return {
    title: i18n._(ADMIN_TITLE),
    robots: NOINDEX,
    referrer: 'strict-origin',
  };
}

/**
 * 어드민 최상위 레이아웃
 * - proxy 를 우회해 들어온 경우를 막으려고 주소 키를 한 번 더 확인 (틀리거나 설정이 없으면 403)
 * - 서비스 헤더·푸터는 각 서비스 페이지가 그리므로 여기서는 아무것도 감싸지 않음
 */
export default async function AdminKeyLayout({
  children,
  params,
}: AdminKeyLayoutProps) {
  const { adminKey } = await params;

  if (!matchesAdminKey(adminKey, process.env.ADMIN_PATH_KEY)) {
    forbidden();
  }

  return children;
}
