'use client';

import { useId } from 'react';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import { ChevronDown, KeyRound, LogOut, UserRound } from 'lucide-react';
import {
  DROPDOWN_ITEM_CLASS,
  DROPDOWN_PANEL_CLASS,
} from '@/components/shared/dropdown-styles';
import LocalizedLink from '@/components/shared/localized-link';
import { useDropdown } from '@/hooks/use-dropdown';
import { logoutAdmin } from '@/lib/actions/admin/auth';
import type { AdminRole } from '@/lib/db/schema/admin';

// 같은 낱말의 다른 뜻(편집 버튼 등)과 번역이 섞이지 않도록 context 로 구분
const ROLE_LABELS: Record<AdminRole, MessageDescriptor> = {
  guest: msg({ message: '게스트', context: 'admin role' }),
  viewer: msg({ message: '조회', context: 'admin role' }),
  editor: msg({ message: '편집', context: 'admin role' }),
  admin: msg({ message: '관리자', context: 'admin role' }),
};

const MENU_ITEM_CLASS = `${DROPDOWN_ITEM_CLASS} flex items-center gap-2 whitespace-nowrap`;

interface AdminProfileMenuProps {
  loginId: string;
  role: AdminRole;
  // 콘솔용 비밀번호 변경 화면 주소 (adminPath 결과)
  passwordHref: string;
}

/**
 * 어드민 헤더 프로필 버튼과 드롭다운
 * - 아이디와 권한 표시, 비밀번호 변경, 로그아웃
 * - 바깥 클릭, Escape, 페이지 이동 시 닫힘
 */
const AdminProfileMenu = ({
  loginId,
  role,
  passwordHref,
}: AdminProfileMenuProps) => {
  const { i18n, t } = useLingui();
  const menuId = useId();
  const { isOpen, toggle, containerRef, triggerRef, firstItemRef, handleBlur } =
    useDropdown<HTMLAnchorElement>();
  const roleLabel = i18n._(ROLE_LABELS[role]);

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t`프로필 메뉴`}
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={toggle}
        className="flex h-9 items-center gap-2 border border-line bg-white px-3 text-[13px] leading-[normal] text-ink transition-colors hover:bg-surface"
      >
        <UserRound aria-hidden="true" className="size-4 text-ink-muted" />
        <span className="max-w-40 truncate font-mono">{loginId}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 text-ink-faint" />
      </button>
      {isOpen && (
        <div
          id={menuId}
          className={`animate-dropdown absolute top-[calc(100%+8px)] right-0 w-60 ${DROPDOWN_PANEL_CLASS}`}
        >
          <div className="flex flex-col gap-1 px-3 py-1">
            <p className="truncate font-mono text-[13px] leading-[1.4] font-semibold text-ink">
              {loginId}
            </p>
            <p className="text-[12px] leading-[1.4] text-ink-faint">
              <Trans>권한: {roleLabel}</Trans>
            </p>
          </div>
          <div aria-hidden="true" className="h-px bg-line" />
          <ul className="flex flex-col gap-1">
            <li>
              <LocalizedLink
                ref={firstItemRef}
                href={passwordHref}
                className={MENU_ITEM_CLASS}
              >
                <KeyRound aria-hidden="true" className="size-4" />
                <Trans>비밀번호 변경</Trans>
              </LocalizedLink>
            </li>
            <li>
              <form action={logoutAdmin}>
                <button type="submit" className={MENU_ITEM_CLASS}>
                  <LogOut aria-hidden="true" className="size-4" />
                  <Trans>로그아웃</Trans>
                </button>
              </form>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default AdminProfileMenu;
