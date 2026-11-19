'use client';

import { usePathname } from 'next/navigation';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { useLingui } from '@lingui/react/macro';
import {
  Bot,
  FileText,
  LayoutDashboard,
  type LucideIcon,
  Power,
  ScrollText,
  Users,
} from 'lucide-react';
import LocalizedLink from '@/components/shared/localized-link';

interface AdminMenuItem {
  // 콘솔 주소 뒤에 붙는 하위 경로 ('' 은 대시보드)
  sub: string;
  label: MessageDescriptor;
  icon: LucideIcon;
}

// 권한과 상관없이 모두 보여 줌 (조치 버튼만 권한에 따라 숨김)
const MENU_ITEMS: AdminMenuItem[] = [
  { sub: '', label: msg`대시보드`, icon: LayoutDashboard },
  { sub: 'users', label: msg`사용자`, icon: Users },
  { sub: 'posts', label: msg`게시글`, icon: FileText },
  { sub: 'prompts', label: msg`프롬프트 내역`, icon: ScrollText },
  { sub: 'ai-prompts', label: msg`AI 프롬프트`, icon: Bot },
  { sub: 'ai-control', label: msg`AI 제어`, icon: Power },
];

const ITEM_CLASS =
  'flex h-10 shrink-0 items-center gap-2.5 px-3 text-[13px] leading-[normal] whitespace-nowrap transition-colors';

// 대시보드는 콘솔 주소와 정확히 같을 때만, 나머지는 하위 화면까지 활성
const isActive = (pathname: string, href: string, sub: string) =>
  pathname === href || (sub !== '' && pathname.startsWith(`${href}/`));

interface AdminSidebarProps {
  // 로케일과 주소 키가 붙은 콘솔 주소 (adminPath 결과)
  basePath: string;
}

/**
 * 콘솔 사이드 메뉴
 * - 넓은 화면은 왼쪽 세로 메뉴, 좁은 화면은 헤더 아래 가로로 넘기는 메뉴
 * - 현재 주소에 해당하는 항목을 강조
 */
const AdminSidebar = ({ basePath }: AdminSidebarProps) => {
  const { i18n, t } = useLingui();
  const pathname = usePathname() ?? '';

  return (
    <nav
      aria-label={t`어드민 메뉴`}
      className="shrink-0 border-b border-line bg-panel lg:w-56 lg:border-r lg:border-b-0"
    >
      <ul className="flex gap-1 overflow-x-auto p-2 lg:sticky lg:top-0 lg:flex-col lg:p-3">
        {MENU_ITEMS.map(({ sub, label, icon: Icon }) => {
          const href = sub ? `${basePath}/${sub}` : basePath;
          const active = isActive(pathname, href, sub);

          return (
            <li key={sub || 'dashboard'}>
              <LocalizedLink
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`${ITEM_CLASS} ${
                  active
                    ? 'bg-brand-soft font-semibold text-brand-strong'
                    : 'text-ink-muted hover:bg-surface hover:text-ink'
                }`}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                {i18n._(label)}
              </LocalizedLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default AdminSidebar;
