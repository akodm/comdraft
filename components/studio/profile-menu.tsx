'use client';

import { useId, useState } from 'react';
import Image from 'next/image';
import { Trans } from '@lingui/react/macro';
import LocalizedLink from '@/components/shared/localized-link';
import SignOutButton from '@/components/shared/sign-out-button';
import SettingsDialog, {
  type SettingsTab,
} from '@/components/studio/settings-dialog';
import { useDropdown } from '@/hooks/use-dropdown';

// 메뉴 항목 (아이콘 + 문구, 42px). 포커스/호버 표시는 공용 드롭다운 항목과 같게
const MENU_ITEM_BASE_CLASS =
  'flex h-10.5 w-full items-center gap-2.5 rounded px-3 text-left text-[13px] leading-[normal] whitespace-nowrap outline-none hover:bg-surface focus:bg-surface';
const MENU_ITEM_CLASS = `${MENU_ITEM_BASE_CLASS} text-ink`;
const DANGER_MENU_ITEM_CLASS = `${MENU_ITEM_BASE_CLASS} text-danger`;

const MenuIcon = ({ name }: { name: string }) => {
  return (
    <Image
      src={`/images/studio/${name}.svg`}
      alt=""
      width={16}
      height={16}
      className="shrink-0"
    />
  );
};

interface StudioProfileMenuProps {
  userName: string;
}

/**
 * 스튜디오 사이드바 아래쪽 프로필 버튼과 메뉴 (버튼 위로 열림)
 * - 대시보드로 이동, 로그아웃
 * - 계정 설정 / 저장소 설정은 메뉴를 닫고 설정 모달을 그 탭으로 엶 (닫으면 프로필 버튼으로 포커스 복귀)
 * - 회원 탈퇴는 화면이 아직 없어 버튼 모양만 구현
 * - 바깥 클릭, Escape(버튼으로 포커스 복귀), 포커스 이탈, 페이지 이동 시 닫힘 (헤더 프로필 메뉴와 같은 동작)
 */
const StudioProfileMenu = ({ userName }: StudioProfileMenuProps) => {
  const menuId = useId();
  const { isOpen, toggle, containerRef, triggerRef, firstItemRef, handleBlur } =
    useDropdown<HTMLAnchorElement>();
  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);

  const openSettings = (tab: SettingsTab) => {
    // 메뉴 버튼으로 포커스를 먼저 옮겨 두면 모달을 닫을 때 그 버튼으로 돌아옴
    triggerRef.current?.focus();
    toggle();
    setSettingsTab(tab);
  };

  return (
    <>
      <div ref={containerRef} className="relative" onBlur={handleBlur}>
        {isOpen && (
          <div
            id={menuId}
            className="absolute -inset-x-1 bottom-[calc(100%+28px)] z-20 flex flex-col gap-0.5 rounded-md border border-line bg-white p-2"
          >
            <ul className="flex flex-col gap-0.5">
              <li>
                <LocalizedLink
                  ref={firstItemRef}
                  href="/dashboard"
                  className={MENU_ITEM_CLASS}
                >
                  <MenuIcon name="layout-dashboard" />
                  <Trans>대시보드</Trans>
                </LocalizedLink>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => openSettings('account')}
                  className={MENU_ITEM_CLASS}
                >
                  <MenuIcon name="menu-user-round" />
                  <Trans>계정 설정</Trans>
                </button>
              </li>
              <li>
                <button
                  type="button"
                  onClick={() => openSettings('repository')}
                  className={MENU_ITEM_CLASS}
                >
                  <MenuIcon name="settings-2" />
                  <Trans>저장소 설정</Trans>
                </button>
              </li>
            </ul>
            <div aria-hidden="true" className="py-1.5">
              <div className="h-px bg-line" />
            </div>
            <ul className="flex flex-col gap-0.5">
              <li>
                <SignOutButton
                  className={MENU_ITEM_CLASS}
                  icon={<MenuIcon name="log-out" />}
                />
              </li>
              <li>
                {/* 회원 탈퇴 기능은 추후 구현 */}
                <button type="button" className={DANGER_MENU_ITEM_CLASS}>
                  <MenuIcon name="user-round-x" />
                  <Trans>회원 탈퇴</Trans>
                </button>
              </li>
            </ul>
          </div>
        )}
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={isOpen}
          aria-controls={menuId}
          onClick={toggle}
          className={`flex h-14 w-full items-center gap-2.5 rounded-md px-3 text-left hover:bg-surface ${
            isOpen ? 'bg-surface' : ''
          }`}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-white">
            <Image
              src="/images/studio/profile.svg"
              alt=""
              width={18}
              height={18}
            />
          </span>
          <span className="min-w-0 flex-1 truncate font-mono text-[13px] leading-[normal] font-medium text-ink">
            {userName}
          </span>
          <Image
            src={
              isOpen
                ? '/images/studio/chevron-up.svg'
                : '/images/studio/chevrons-up-down.svg'
            }
            alt=""
            width={15}
            height={15}
          />
        </button>
      </div>
      {settingsTab && (
        <SettingsDialog
          initialTab={settingsTab}
          onClose={() => setSettingsTab(null)}
        />
      )}
    </>
  );
};

export default StudioProfileMenu;
