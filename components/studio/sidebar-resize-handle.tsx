'use client';

import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { SIDEBAR_WIDTH } from '@/lib/studio/sidebar-width';

interface SidebarResizeHandleProps {
  label: string;
  width: number;
  onPreview: (width: number) => void;
  onCommit: (width: number) => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startWidth: number;
  width: number;
}

/**
 * 사이드바 오른쪽 가장자리의 너비 조절 손잡이 (PC 전용)
 * - 끌어서 조절, 화살표·Home·End 키로도 조절, 두 번 눌러 기본 너비로
 * - 끄는 동안에는 미리보기만 하고, 놓을 때 저장
 */
const SidebarResizeHandle = ({
  label,
  width,
  onPreview,
  onCommit,
}: SidebarResizeHandleProps) => {
  const dragRef = useRef<DragState | null>(null);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: width,
      width,
    };
    // 끄는 동안 글자가 선택되거나 커서가 바뀌지 않도록
    document.body.classList.add('cursor-col-resize', 'select-none');
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    drag.width = drag.startWidth + event.clientX - drag.startX;
    onPreview(drag.width);
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    dragRef.current = null;
    document.body.classList.remove('cursor-col-resize', 'select-none');
    onCommit(drag.width);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = {
      ArrowLeft: width - SIDEBAR_WIDTH.step,
      ArrowRight: width + SIDEBAR_WIDTH.step,
      Home: SIDEBAR_WIDTH.min,
      End: SIDEBAR_WIDTH.max,
    }[event.key];

    if (next === undefined) return;

    event.preventDefault();
    onCommit(next);
  };

  // 포커스를 받는 separator 는 ARIA 에서 조작 가능한 위젯 (창 분할 손잡이 패턴) 이지만 jsx-a11y 는 정적 역할로 봄
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_WIDTH.min}
      aria-valuemax={SIDEBAR_WIDTH.max}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishDrag}
      onPointerCancel={finishDrag}
      onKeyDown={handleKeyDown}
      onDoubleClick={() => onCommit(SIDEBAR_WIDTH.default)}
      className="group absolute inset-y-0 -right-1.5 z-10 hidden w-3 cursor-col-resize touch-none outline-none pc:block"
    >
      <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-transparent transition-colors group-hover:bg-brand/40 group-focus-visible:bg-brand group-active:bg-brand" />
    </div>
  );
};

export default SidebarResizeHandle;
