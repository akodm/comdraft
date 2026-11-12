/**
 * 계정 설정 화면의 사용량 표시 계산 (순수 함수, 서버/클라이언트 공용)
 */

const MINUTE_MS = 60 * 1000;
const HOUR_MINUTES = 60;
const DAY_MINUTES = 24 * HOUR_MINUTES;

/**
 * 이번 주 남은 사용량 비율 (0~1)
 * - 한도를 넘어 남은 양이 음수면 0, 한도가 0 이하면 0
 * @example getRemainingRatio(4_320_000, 6_000_000) // 0.72
 */
export const getRemainingRatio = (remaining: number, limit: number) => {
  if (limit <= 0) {
    return 0;
  }

  return Math.min(Math.max(remaining / limit, 0), 1);
};

/**
 * 화면에 보여 줄 이번 주 사용 퍼센트 (0~100)
 * - 남은 비율에서 계산하고 올림: 쓴 양을 실제보다 적게 보이지 않도록
 * - 올림 전에 소수 여섯째 자리에서 반올림 (0.94 → 6.000000000000005 같은 부동소수점 오차로 7 이 되지 않게)
 * @example toUsedPercent(0.94) // 6
 */
export const toUsedPercent = (remainingRatio: number) => {
  const used = (1 - Math.min(Math.max(remainingRatio, 0), 1)) * 100;

  return Math.ceil(Math.round(used * 1e6) / 1e6);
};

export interface ResetCountdown {
  days: number;
  hours: number;
  minutes: number;
}

/**
 * 초기화까지 남은 시간 (분 단위 올림, 이미 지났으면 모두 0)
 * - 분은 올림: 1분 미만 남았을 때도 "0분"이 아니라 "1분"으로 보이게
 * @example getResetCountdown(new Date('2026-11-15T15:00Z'), new Date('2026-11-13T10:00Z')) // { days: 2, hours: 5, minutes: 0 }
 */
export const getResetCountdown = (
  resetsAt: Date,
  now: Date,
): ResetCountdown => {
  const totalMinutes = Math.max(
    Math.ceil((resetsAt.getTime() - now.getTime()) / MINUTE_MS),
    0,
  );

  return {
    days: Math.floor(totalMinutes / DAY_MINUTES),
    hours: Math.floor((totalMinutes % DAY_MINUTES) / HOUR_MINUTES),
    minutes: totalMinutes % HOUR_MINUTES,
  };
};

/**
 * 다음 정각 분까지 남은 밀리초 (분 단위 갱신 타이머를 분 경계에 맞추기 위함)
 * - 정확히 분 경계면 1분 뒤
 */
export const msUntilNextMinute = (now: Date) =>
  MINUTE_MS - (now.getTime() % MINUTE_MS);
