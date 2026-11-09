'use client';

import { useId } from 'react';
import Image from 'next/image';
import { useLingui } from '@lingui/react/macro';
import {
  DROPDOWN_ITEM_BASE_CLASS,
  DROPDOWN_ITEM_CLASS,
  DROPDOWN_PANEL_CLASS,
} from '@/components/shared/dropdown-styles';
import LocalizedLink from '@/components/shared/localized-link';
import { useDropdown } from '@/hooks/use-dropdown';
import { useLocale } from '@/hooks/use-locale';
import { useLocalizedPathname } from '@/hooks/use-localized-pathname';
import { LOCALE_LABELS, LOCALES } from '@/lib/i18n/config';

interface LanguageMenuProps {
  // header: 메인/대시보드 헤더 (모바일은 작은 버튼), studio: 초안 작성 스튜디오 사이드바 (64 × 36 버튼)
  variant?: 'header' | 'studio';
}

const CURRENT_ITEM_CLASS = `${DROPDOWN_ITEM_BASE_CLASS} whitespace-nowrap font-medium text-ink`;
const MENU_ITEM_CLASS = `${DROPDOWN_ITEM_CLASS} whitespace-nowrap`;

/**
 * 헤더 언어 변경 버튼과 언어 선택 드롭다운
 * - 현재 경로를 유지한 채 로케일 세그먼트만 바꿔 이동 (서버 렌더링 결과가 로케일별로 달라지므로 URL 이동)
 * - 언어 이름은 번역하지 않고 각 언어의 자기 이름으로 표시
 */
const LanguageMenu = ({ variant = 'header' }: LanguageMenuProps) => {
  const { t } = useLingui();
  const menuId = useId();
  const currentLocale = useLocale();
  const path = useLocalizedPathname();
  const { isOpen, toggle, containerRef, triggerRef, firstItemRef, handleBlur } =
    useDropdown<HTMLAnchorElement>();

  return (
    <div ref={containerRef} className="relative" onBlur={handleBlur}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t`언어 변경`}
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={toggle}
        className={
          variant === 'studio'
            ? 'flex h-9 w-16 items-center justify-center gap-2 border border-line bg-white'
            : 'flex h-10 w-15.5 items-center justify-center pc:w-auto pc:border pc:border-line pc:bg-white pc:px-2.75'
        }
      >
        {variant === 'studio' ? (
          <>
            <Image src="/images/main/globe.svg" alt="" width={19} height={19} />
            <Image
              src="/images/main/chevron-down.svg"
              alt=""
              width={14}
              height={14}
            />
          </>
        ) : (
          <span className="flex h-7 w-13.5 items-center justify-center gap-1.25 rounded border border-line bg-white px-1.5 pc:contents">
            <Image
              src="/images/main/globe-mobile.svg"
              alt=""
              width={17}
              height={17}
              className="pc:hidden"
            />
            <Image
              src="/images/main/chevron-down-mobile.svg"
              alt=""
              width={12}
              height={12}
              className="pc:hidden"
            />
            <Image
              src="/images/main/globe.svg"
              alt=""
              width={19}
              height={19}
              className="hidden pc:block"
            />
            <Image
              src="/images/main/chevron-down.svg"
              alt=""
              width={14}
              height={14}
              className="hidden pc:block"
            />
          </span>
        )}
      </button>
      {isOpen && (
        <div
          id={menuId}
          className={`absolute top-[calc(100%+8px)] right-0 w-40 ${DROPDOWN_PANEL_CLASS}`}
        >
          <ul className="flex flex-col gap-1">
            {LOCALES.map((locale) => {
              const isCurrent = locale === currentLocale;

              return (
                <li key={locale}>
                  {/* 열리면 현재 언어 항목에 포커스 */}
                  <LocalizedLink
                    ref={isCurrent ? firstItemRef : undefined}
                    href={path}
                    locale={locale}
                    hrefLang={locale}
                    lang={locale}
                    aria-current={isCurrent ? 'true' : undefined}
                    className={isCurrent ? CURRENT_ITEM_CLASS : MENU_ITEM_CLASS}
                  >
                    {LOCALE_LABELS[locale]}
                  </LocalizedLink>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};

export default LanguageMenu;
