'use client';

import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';

// 툴팁 너비와 화면 가장자리 여백 (px)
const TOOLTIP_WIDTH = 240;
const VIEWPORT_MARGIN = 8;
// 아이콘과 툴팁 사이 간격 (px)
const TOOLTIP_GAP = 6;

interface TooltipPosition {
  left: number;
  top: number;
}

interface TooltipProps {
  label: string;
  // 포커스를 받을 수 있는 요소 하나 (aria-describedby 가 붙음)
  children: ReactElement<{ 'aria-describedby'?: string }>;
}

// 트리거 아래에 두되 화면 밖으로 나가지 않게 가로 위치를 맞춤
const getPosition = (trigger: HTMLElement): TooltipPosition => {
  const rect = trigger.getBoundingClientRect();
  const width = Math.min(
    TOOLTIP_WIDTH,
    window.innerWidth - VIEWPORT_MARGIN * 2,
  );
  const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN;

  return {
    left: Math.max(VIEWPORT_MARGIN, Math.min(rect.left, maxLeft)),
    top: rect.bottom + TOOLTIP_GAP,
  };
};

/**
 * 짧은 설명 툴팁
 * - 마우스를 올리거나 키보드로 포커스하면 보이고, 터치 기기는 탭하면 열리고 바깥을 탭하면 닫힘 (Esc 로도 닫힘)
 * - 스크롤 영역·transform 안에서도 잘리지 않도록 body 에 띄워 화면 좌표로 배치
 * - 툴팁 모양은 관리자 Claude 상태 표시 툴팁과 맞춤
 */
const Tooltip = ({ label, children }: TooltipProps) => {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  // 마지막 포인터 종류 (터치는 호버가 없어 탭으로 여닫음)
  const pointerTypeRef = useRef('mouse');
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const isOpen = position !== null;

  const open = () => {
    if (triggerRef.current) setPosition(getPosition(triggerRef.current));
  };
  const close = () => setPosition(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node)) {
        setPosition(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPosition(null);
    };
    // 스크롤하거나 크기가 바뀌면 위치가 어긋나므로 닫음
    const handleMove = () => setPosition(null);

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleMove);
    window.addEventListener('scroll', handleMove, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleMove);
      window.removeEventListener('scroll', handleMove, true);
    };
  }, [isOpen]);

  return (
    // 포커스는 자식 요소가 받고, 이 래퍼는 자식에서 올라온 이벤트(호버·탭·포커스)만 받음
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
    <span
      ref={triggerRef}
      className="inline-flex"
      onPointerDown={(event) => {
        pointerTypeRef.current = event.pointerType;
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === 'mouse') open();
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') close();
      }}
      onClick={() => {
        if (pointerTypeRef.current !== 'mouse') {
          if (isOpen) close();
          else open();
        }
      }}
      onFocus={(event) => {
        // 마우스·터치로 얻은 포커스는 호버·탭이 처리하므로 키보드 포커스만 여기서 엶
        if ((event.target as HTMLElement).matches(':focus-visible')) open();
      }}
      onBlur={close}
    >
      {cloneElement(children, { 'aria-describedby': id })}
      {position &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            style={{ left: position.left, top: position.top }}
            className="pointer-events-none fixed z-50 w-60 max-w-[calc(100vw-16px)] border border-line bg-panel p-3 text-left text-[12px] leading-[1.5] break-keep text-ink shadow-md"
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
};

export default Tooltip;
