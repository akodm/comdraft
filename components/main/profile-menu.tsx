'use client';

import { useId } from 'react';
import Image from 'next/image';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  DROPDOWN_ITEM_BASE_CLASS,
  DROPDOWN_ITEM_CLASS,
  DROPDOWN_PANEL_CLASS,
} from '@/components/shared/dropdown-styles';
import LocalizedLink from '@/components/shared/localized-link';
import SignOutButton from '@/components/shared/sign-out-button';
import { useDropdown } from '@/hooks/use-dropdown';

interface ProfileMenuProps {
  isSignedIn: boolean;
}

const PROFILE_BUTTON_CLASS =
  'flex size-10 items-center justify-center rounded-full border border-line bg-white';

// 드롭다운 항목 (첫 항목은 열릴 때 포커스되며 강조 표시)
const MENU_ITEM_CLASS = `${DROPDOWN_ITEM_CLASS} whitespace-nowrap`;
const DANGER_MENU_ITEM_CLASS = `${DROPDOWN_ITEM_BASE_CLASS} whitespace-nowrap text-danger`;

const ProfileIcon = () => {
  return (
    <>
      <Image
        src="/images/main/user-round-mobile.svg"
        alt=""
        width={17}
        height={17}
        className="pc:hidden"
      />
      <Image
        src="/images/main/user-round.svg"
        alt=""
        width={18}
        height={18}
        className="hidden pc:block"
      />
    </>
  );
};

/**
 * 헤더 프로필 버튼
 * - 로그아웃 상태: 로그인/회원가입 페이지로 이동
 * - 로그인 상태: 프로필 드롭다운 (바깥 클릭, Escape, 페이지 이동 시 닫힘)
 */
const ProfileMenu = ({ isSignedIn }: ProfileMenuProps) => {
  const { t } = useLingui();
  const menuId = useId();
  const { isOpen, toggle, containerRef, triggerRef, firstItemRef, handleBlur } =
    useDropdown<HTMLAnchorElement>();

  if (!isSignedIn) {
    return (
      <LocalizedLink
        href="/sign-in"
        aria-label={t`로그인`}
        className={PROFILE_BUTTON_CLASS}
      >
        <ProfileIcon />
      </LocalizedLink>
    );
  }

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t`프로필 메뉴`}
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={toggle}
        className={PROFILE_BUTTON_CLASS}
      >
        <ProfileIcon />
      </button>
      {isOpen && (
        <div
          id={menuId}
          className={`absolute top-[calc(100%+8px)] right-0 w-60 ${DROPDOWN_PANEL_CLASS}`}
        >
          <p className="text-[12px] leading-[1.2] font-bold whitespace-nowrap text-ink">
            <Trans>프로필 메뉴</Trans>
          </p>
          <div aria-hidden="true" className="h-px bg-line" />
          <ul className="flex flex-col gap-1">
            <li>
              <LocalizedLink
                ref={firstItemRef}
                href="/dashboard"
                className={MENU_ITEM_CLASS}
              >
                <Trans>대시보드</Trans>
              </LocalizedLink>
            </li>
            <li>
              {/* 계정 페이지가 아직 없어 디자인만 구현 */}
              <button type="button" className={MENU_ITEM_CLASS}>
                <Trans>계정</Trans>
              </button>
            </li>
            <li>
              <SignOutButton className={MENU_ITEM_CLASS} />
            </li>
          </ul>
          <div aria-hidden="true" className="h-px bg-line" />
          {/* 회원탈퇴 기능이 아직 없어 디자인만 구현 */}
          <button type="button" className={DANGER_MENU_ITEM_CLASS}>
            <Trans>회원탈퇴</Trans>
          </button>
        </div>
      )}
    </div>
  );
};

export default ProfileMenu;
