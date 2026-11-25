import { useEffect, useState } from 'react';

/**
 * 닫힐 때도 애니메이션이 끝날 때까지 그려 두기 위한 상태 (사이드바·메뉴 패널)
 * - isRendered: 열려 있거나 닫히는 중이면 true (이때만 렌더링)
 * - isClosing: 닫히는 중 (닫힘 애니메이션용 클래스·inert 를 거는 데 씀)
 * - 열림 애니메이션은 CSS @starting-style(starting:) 로 처리
 */
export const usePresence = (isOpen: boolean, exitMs: number) => {
  const [isMounted, setIsMounted] = useState(isOpen);

  // 열리면 바로 그림 (렌더 중 상태 맞추기: 이펙트를 기다리면 한 프레임 늦음)
  if (isOpen && !isMounted) {
    setIsMounted(true);
  }

  useEffect(() => {
    if (isOpen || !isMounted) return;

    const timer = window.setTimeout(() => setIsMounted(false), exitMs);

    return () => window.clearTimeout(timer);
  }, [isOpen, isMounted, exitMs]);

  return { isRendered: isOpen || isMounted, isClosing: !isOpen && isMounted };
};
