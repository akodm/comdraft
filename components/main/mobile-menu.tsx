'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Trans, useLingui } from '@lingui/react/macro';
import BrandLogo from '@/components/main/brand-logo';

// PC 레이아웃 기준 (css/globals.css 의 --breakpoint-pc 와 같은 값)
const PC_MEDIA_QUERY = '(min-width: 1320px)';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * 모바일 헤더의 메뉴 버튼과 사이드 메뉴 (PC 레이아웃에서는 렌더링하지 않음)
 * - 배경 클릭, Escape, 페이지 이동, PC 폭으로 넓어지면 닫힘
 * - 열려 있는 동안 본문 스크롤을 막고 포커스를 메뉴 안에 가둠, 닫으면 메뉴 버튼으로 포커스 복귀
 * - 메뉴 항목 동작은 아직 정해지지 않아 디자인만 구현
 */
const MobileMenu = () => {
  const { t } = useLingui();
  const pathname = usePathname();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  // 연 시점의 경로를 기억해 경로가 바뀌면 자동으로 닫힌 상태가 되도록 함
  const [openedPath, setOpenedPath] = useState<string | null>(null);
  const isOpen = openedPath !== null && openedPath === pathname;

  const close = () => {
    setOpenedPath(null);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenedPath(null);
        triggerRef.current?.focus();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) {
        return;
      }

      // 포커스 가두기: 처음/마지막 요소에서 Tab 이동 시 반대쪽 끝으로 순환
      const focusable = [
        ...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!first || !last) {
        return;
      }

      const active = document.activeElement;

      if (
        event.shiftKey &&
        (active === first || !panelRef.current.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    // PC 폭이 되면 메뉴 버튼이 사라지므로 닫음
    const pcMedia = window.matchMedia(PC_MEDIA_QUERY);
    const handleMediaChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setOpenedPath(null);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    pcMedia.addEventListener('change', handleMediaChange);

    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handleKeyDown);
      pcMedia.removeEventListener('change', handleMediaChange);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t`메뉴 열기`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setOpenedPath(pathname)}
        className="flex h-10 w-8 items-center justify-center pc:hidden"
      >
        <Image src="/images/main/menu.svg" alt="" width={22} height={22} />
      </button>
      {isOpen && (
        <div className="fixed inset-0 z-50 pc:hidden">
          {/* 배경 클릭으로 닫기 (키보드 사용자는 닫기 버튼/Escape 사용) */}
          <div
            aria-hidden="true"
            onClick={close}
            className="absolute inset-0 bg-ink/40"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="absolute inset-y-0 right-0 flex w-70 max-w-full flex-col bg-white"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
              <h2 id={titleId}>
                <BrandLogo placement="footer" />
                <span className="sr-only">
                  <Trans>메뉴</Trans>
                </span>
              </h2>
              <button
                ref={closeButtonRef}
                type="button"
                aria-label={t`메뉴 닫기`}
                onClick={close}
                className="flex size-10 items-center justify-center"
              >
                <Image
                  src="/images/main/x.svg"
                  alt=""
                  width={24}
                  height={24}
                  loading="eager"
                />
              </button>
            </div>
            <nav
              aria-label={t`주요 메뉴`}
              className="flex min-h-0 flex-1 flex-col overflow-y-auto p-5"
            >
              <ul className="flex flex-col">
                <li>
                  <button
                    type="button"
                    className="flex h-16 w-full items-center justify-between border-b border-line text-left"
                  >
                    <span className="text-[18px] leading-[1.2] font-medium whitespace-nowrap text-ink">
                      <Trans>게시글</Trans>
                    </span>
                    <Image
                      src="/images/main/arrow-up-right.svg"
                      alt=""
                      width={18}
                      height={18}
                      loading="eager"
                    />
                  </button>
                </li>
              </ul>
            </nav>
          </div>
        </div>
      )}
    </>
  );
};

export default MobileMenu;
