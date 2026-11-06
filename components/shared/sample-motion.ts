import {
  useReducedMotion,
  type TargetAndTransition,
  type Transition,
} from 'motion/react';

/**
 * 예시 카드(커밋 → 초안)의 단계를 차례로 한 번씩 강조하는 반복 애니메이션
 * - times 는 반복 한 번(duration 초)을 0~1 로 본 키프레임 시점
 */
export const loop = (times: number[], duration = 6): Transition => ({
  duration,
  times,
  ease: 'easeInOut',
  repeat: Infinity,
});

// 커밋 카드가 오른쪽으로 밀렸다 돌아옴
export const commitPulse = (transition: Transition): TargetAndTransition => ({
  x: [0, 0, 4, 0, 0],
  opacity: [1, 1, 0.55, 1, 1],
  transition,
});

// 변환 화살표가 아래로 움직였다 돌아옴
export const arrowNudge = (transition: Transition): TargetAndTransition => ({
  y: [0, 0, 4, 0, 0],
  transition,
});

// 초안이 흐려졌다가 떠오름
export const draftLift = (
  yTransition: Transition,
  opacityTransition: Transition,
): TargetAndTransition => ({
  y: [0, 0, -4, 0, 0],
  opacity: [1, 0.78, 1, 1],
  transition: { y: yTransition, opacity: opacityTransition },
});

// 동작 줄이기 설정을 켠 사용자에게는 정지 화면으로 표시
export const useSampleAnimate = () => {
  const shouldReduceMotion = useReducedMotion();

  return (target: TargetAndTransition) =>
    shouldReduceMotion ? undefined : target;
};
