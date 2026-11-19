'use client';

import type { ReactNode } from 'react';
import { useLocalizedPathname } from '@/hooks/use-localized-pathname';

// 로케일을 뗀 어드민 경로 (/admin, /admin/...)
const ADMIN_PATH_PATTERN = /^\/admin(\/|$)/;

/**
 * 어드민 화면에서는 그리지 않는 서비스 전용 요소 (언어 전환 링크, 방문 분석 스크립트)
 * - 방문 분석에 주소 키가 담긴 어드민 주소가 기록되지 않게 함
 */
const HideOnAdmin = ({ children }: { children: ReactNode }) => {
  const path = useLocalizedPathname();

  return ADMIN_PATH_PATTERN.test(path) ? null : children;
};

export default HideOnAdmin;
