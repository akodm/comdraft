import { Trans, useLingui } from '@lingui/react/macro';
import BrandLogo from '@/components/main/brand-logo';
import LanguageMenu from '@/components/main/language-menu';
import MobileMenu from '@/components/main/mobile-menu';
import ProfileMenu from '@/components/main/profile-menu';

interface MainHeaderProps {
  // 서버에서 확인한 로그인 여부 (프로필 버튼 동작이 달라짐)
  isSignedIn: boolean;
}

/**
 * 메인 헤더
 * - 프로필: 로그인 상태면 드롭다운, 아니면 로그인 페이지로 이동
 * - 모바일 메뉴: 사이드 메뉴 열기
 * - 언어 변경: 언어 선택 드롭다운
 * - 게시글 버튼은 동작이 아직 정해지지 않아 디자인만 구현
 */
const MainHeader = ({ isSignedIn }: MainHeaderProps) => {
  const { t } = useLingui();

  return (
    <header className="h-16 border-b border-line px-4 pc:h-24 pc:px-5">
      <div className="flex h-full items-center justify-between pc:mx-auto pc:max-w-7xl">
        <div className="flex items-center gap-18">
          <BrandLogo />
          <nav aria-label={t`주요 메뉴`} className="hidden pc:flex">
            <button
              type="button"
              className="text-[15px] leading-[1.2] font-medium whitespace-nowrap text-ink-muted"
            >
              <Trans>게시글</Trans>
            </button>
          </nav>
        </div>
        <div className="flex items-center gap-1 pc:gap-6">
          <LanguageMenu />
          <ProfileMenu isSignedIn={isSignedIn} />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
};

export default MainHeader;
