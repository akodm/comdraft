import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * 버튼으로 여닫는 헤더 드롭다운의 공통 동작 (프로필 메뉴, 언어 메뉴)
 * - 열리면 첫 항목에 포커스
 * - 바깥 클릭, Escape(메뉴 버튼으로 포커스 복귀), 포커스가 빠져나갈 때, 페이지 이동 시 닫힘
 * @example
 * const { isOpen, toggle, containerRef, triggerRef, firstItemRef, handleBlur } =
 *   useDropdown<HTMLAnchorElement>();
 */
export const useDropdown = <TFirstItem extends HTMLElement>() => {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<TFirstItem>(null);
  // 연 시점의 경로를 기억해 경로가 바뀌면 자동으로 닫힌 상태가 되도록 함
  const [openedPath, setOpenedPath] = useState<string | null>(null);
  const isOpen = openedPath !== null && openedPath === pathname;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    firstItemRef.current?.focus();

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpenedPath(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenedPath(null);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const toggle = () => setOpenedPath(isOpen ? null : pathname);

  // 드롭다운 안에서 포커스가 빠져나가면 닫음 (Tab 으로 다음 요소로 이동한 경우)
  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (
      event.relatedTarget &&
      !event.currentTarget.contains(event.relatedTarget as Node)
    ) {
      setOpenedPath(null);
    }
  };

  return { isOpen, toggle, containerRef, triggerRef, firstItemRef, handleBlur };
};
