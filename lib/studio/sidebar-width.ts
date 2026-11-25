/**
 * 스튜디오 사이드바 너비 (PC 에서 마우스·키보드로 조절, 브라우저에 저장)
 * - 두 사이드바를 모두 최대로 넓혀도 PC 최소 폭(1320px)에서 편집 영역이 520px 이상 남도록 최대값을 정함
 */

export const SIDEBAR_WIDTH = {
  default: 280,
  min: 240,
  max: 400,
  // 키보드 화살표 한 번에 바뀌는 너비
  step: 16,
} as const;

export type SidebarWidthKey = 'drafts' | 'commits';

// 브라우저 저장소 키 (사이드바마다 따로)
export const getSidebarWidthStorageKey = (key: SidebarWidthKey) =>
  `comdraft:studio:sidebar-width:${key}`;

// 최소·최대 사이로 맞추고 정수로 반올림
export const clampSidebarWidth = (width: number) =>
  Math.round(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, width)));

// 저장된 값 읽기 (없거나 숫자가 아니면 기본값, 범위를 벗어나면 맞춤)
export const parseStoredSidebarWidth = (value: string | null) => {
  if (value === null || value.trim() === '') return SIDEBAR_WIDTH.default;

  const width = Number(value);

  return Number.isFinite(width)
    ? clampSidebarWidth(width)
    : SIDEBAR_WIDTH.default;
};
