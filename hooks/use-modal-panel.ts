import { useEffect, type RefObject } from 'react';

// PC 레이아웃 기준 (css/globals.css 의 --breakpoint-pc 와 같은 값)
const PC_MEDIA_QUERY = '(min-width: 1320px)';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface UseModalPanelOptions {
  isOpen: boolean;
  panelRef: RefObject<HTMLElement | null>;
  // 열릴 때 처음 포커스를 줄 요소 (보통 닫기 버튼)
  initialFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
}

/**
 * 모바일 전용 모달 패널의 공통 동작 (열려 있는 동안만)
 * - 본문 스크롤 잠금, 처음 포커스 이동, Tab 포커스 가두기
 * - Escape 로 닫기, PC 폭으로 넓어지면 닫기
 */
export const useModalPanel = ({
  isOpen,
  panelRef,
  initialFocusRef,
  onClose,
}: UseModalPanelOptions) => {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    initialFocusRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
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

    const pcMedia = window.matchMedia(PC_MEDIA_QUERY);
    const handleMediaChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    pcMedia.addEventListener('change', handleMediaChange);

    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener('keydown', handleKeyDown);
      pcMedia.removeEventListener('change', handleMediaChange);
    };
  }, [isOpen, panelRef, initialFocusRef, onClose]);
};
