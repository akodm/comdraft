import AdminHeader from '@/components/admin/admin-header';
import AdminSidebar from '@/components/admin/admin-sidebar';
import { requireAdmin, requireAdminKey } from '@/lib/admin/guard';
import { adminPath } from '@/lib/admin/path-key';
import { getLocale, initLingui } from '@/lib/i18n/server';

/**
 * 어드민 콘솔 틀: 위 헤더, 왼쪽 사이드 메뉴, 오른쪽 넓은 본문 (푸터 없음)
 * - 레이아웃은 화면 이동 때 다시 그려지지 않으므로 각 페이지도 requireAdmin 으로 다시 확인
 * - 링크 주소는 주소 값(params)이 아닌 설정된 키로 만듦
 */
export default async function AdminConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  await initLingui();
  const lang = await getLocale();
  const session = await requireAdmin('view');
  const basePath = adminPath(lang, requireAdminKey());

  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <AdminHeader
        lang={lang}
        loginId={session.loginId}
        role={session.role}
        passwordHref={`${basePath}/account/password`}
      />
      <div className="flex flex-1 flex-col lg:flex-row">
        <AdminSidebar basePath={basePath} />
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
