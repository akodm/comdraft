import type { CSSProperties } from 'react';

// 등장 순서 (서버 컴포넌트에서도 쓰도록 클라이언트 모듈과 분리)
// - reveal: 화면에 들어올 때 떠오르는 요소, rise: 첫 화면에서 바로 떠오르는 요소
export const revealOrder = (order: number) =>
  ({ '--reveal-order': order }) as CSSProperties;

export const riseOrder = (order: number) =>
  ({ '--rise-order': order }) as CSSProperties;
