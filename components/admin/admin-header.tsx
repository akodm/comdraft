import { Trans } from '@lingui/react/macro';
import AdminProfileMenu from '@/components/admin/admin-profile-menu';
import BrandLogo from '@/components/main/brand-logo';
import LocalizedAnchor from '@/components/shared/localized-anchor';
import { localizePath, type Locale } from '@/lib/i18n/config';
import type { AdminRole } from '@/lib/db/schema/admin';

interface AdminHeaderProps {
  lang: Locale;
  loginId: string;
  role: AdminRole;
  // 콘솔용 비밀번호 변경 화면 주소 (adminPath 결과)
  passwordHref: string;
}

/**
 * 콘솔 헤더: 왼쪽 로고, 오른쪽 프로필 버튼
 * - 로고는 서비스 인덱스로 이동 (서비스 로그인 세션이 있으면 서비스 쪽에서 대시보드로 보냄)
 * - 어드민과 서비스 화면이 같은 페이지 안에서 이어지지 않도록 클라이언트 이동 대신 전체 페이지 이동
 *   (서비스 쪽 방문 분석 스크립트가 뒤로 가기로 돌아온 어드민 주소를 기록하지 않게)
 */
const AdminHeader = ({
  lang,
  loginId,
  role,
  passwordHref,
}: AdminHeaderProps) => {
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-white px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <LocalizedAnchor href={localizePath(lang, '/')}>
          <BrandLogo />
        </LocalizedAnchor>
        <span className="border border-line px-1.5 py-0.5 text-[11px] leading-[normal] font-medium text-ink-faint">
          <Trans>어드민</Trans>
        </span>
      </div>
      <AdminProfileMenu
        loginId={loginId}
        role={role}
        passwordHref={passwordHref}
      />
    </header>
  );
};

export default AdminHeader;
