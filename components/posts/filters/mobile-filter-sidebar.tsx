'use client';

import {
  useCallback,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import Image from 'next/image';
import { useLingui } from '@lingui/react/macro';
import PostFilterTitle from '@/components/posts/filters/post-filter-title';
import { useModalPanel } from '@/hooks/use-modal-panel';
import { usePresence } from '@/hooks/use-presence';

// 닫힘 애니메이션 시간 (duration-300 과 같은 값)
const SIDEBAR_EXIT_MS = 300;

interface MobileFilterSidebarProps {
  // 걸린 필터가 있으면 여는 버튼에 표시
  hasActiveFilters: boolean;
  // 필터 섹션 (PC 패널과 같은 내용)
  children: ReactNode;
}

/**
 * 모바일 게시글 필터: 화면 오른쪽 가장자리의 화살표 버튼과 화면 전체를 덮는 사이드바
 * - PC 레이아웃에서는 렌더링하지 않음 (PC 는 목록 오른쪽 패널)
 * - 필터 링크를 누르면 바로 닫혀 걸러진 목록이 보임
 * - Escape, 닫기 버튼, PC 폭으로 넓어지면 닫힘, 닫으면 여는 버튼으로 포커스 복귀
 * - 오른쪽에서 밀려 들어오고, 닫힐 때도 오른쪽으로 밀려 나감
 */
const MobileFilterSidebar = ({
  hasActiveFilters,
  children,
}: MobileFilterSidebarProps) => {
  const { t } = useLingui();
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const { isRendered, isClosing } = usePresence(isOpen, SIDEBAR_EXIT_MS);

  const close = useCallback(() => {
    setIsOpen(false);
    triggerRef.current?.focus();
  }, []);

  useModalPanel({
    isOpen,
    panelRef,
    initialFocusRef: closeButtonRef,
    onClose: close,
  });

  // 필터 링크로 이동하면 닫음 (필터 종류가 늘어도 링크마다 따로 연결하지 않도록 위임)
  const handlePanelClick = (event: MouseEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('a[href]')) {
      close();
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={t`필터 열기`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen(true)}
        className="fixed top-1/2 right-0 z-40 flex h-14 w-6 -translate-y-1/2 items-center justify-center rounded-l-lg border border-r-0 border-line bg-white pc:hidden"
      >
        <Image
          src="/images/posts/chevron-left.svg"
          alt=""
          width={18}
          height={18}
        />
        {hasActiveFilters && (
          <span
            aria-hidden="true"
            className="absolute top-1.5 left-1.5 size-1.5 bg-brand"
          />
        )}
      </button>
      {isRendered && (
        // 클릭은 안쪽 링크에서 올라온 것만 처리 (키보드 Enter 로 링크를 눌러도 click 이 발생하므로 키 처리 불필요)
        // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          onClick={handlePanelClick}
          inert={isClosing}
          className={`fixed inset-0 z-50 flex flex-col bg-white transition-[translate] duration-300 ease-out starting:translate-x-full pc:hidden ${
            isClosing ? 'translate-x-full ease-in' : ''
          }`}
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-line px-5">
            <PostFilterTitle id={titleId} />
            <button
              ref={closeButtonRef}
              type="button"
              aria-label={t`필터 닫기`}
              onClick={close}
              className="-mr-2 flex size-10 items-center justify-center"
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
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
            {children}
          </div>
        </div>
      )}
    </>
  );
};

export default MobileFilterSidebar;
