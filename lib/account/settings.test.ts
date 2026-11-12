import { describe, expect, it } from 'vitest';
import {
  getRemainingRatio,
  getResetCountdown,
  msUntilNextMinute,
  toUsedPercent,
} from '@/lib/account/settings';

describe('getRemainingRatio', () => {
  it('남은 양을 한도 대비 비율로 돌려준다', () => {
    expect(getRemainingRatio(4_320_000, 6_000_000)).toBeCloseTo(0.72);
  });

  it('한도를 넘어 남은 양이 음수면 0', () => {
    expect(getRemainingRatio(-100, 300_000)).toBe(0);
  });

  it('한도가 0 이하면 0', () => {
    expect(getRemainingRatio(100, 0)).toBe(0);
  });

  it('남은 양이 한도보다 커도 1 을 넘지 않는다', () => {
    expect(getRemainingRatio(400_000, 300_000)).toBe(1);
  });
});

describe('toUsedPercent', () => {
  it('남은 비율에서 사용 퍼센트를 올림해 계산한다', () => {
    expect(toUsedPercent(0.94)).toBe(6);
    expect(toUsedPercent(0.729)).toBe(28);
    expect(toUsedPercent(0.999)).toBe(1);
  });

  it('하나도 안 썼으면 0, 다 썼으면 100', () => {
    expect(toUsedPercent(1)).toBe(0);
    expect(toUsedPercent(0)).toBe(100);
  });
});

describe('getResetCountdown', () => {
  const resetsAt = new Date('2026-11-15T15:00:00Z');

  it('일·시간·분으로 나눈다', () => {
    expect(
      getResetCountdown(resetsAt, new Date('2026-11-13T10:00:00Z')),
    ).toEqual({ days: 2, hours: 5, minutes: 0 });
  });

  it('분은 올림한다 (30초 남으면 1분)', () => {
    expect(
      getResetCountdown(resetsAt, new Date('2026-11-15T14:59:30Z')),
    ).toEqual({ days: 0, hours: 0, minutes: 1 });
  });

  it('이미 지났으면 모두 0', () => {
    expect(
      getResetCountdown(resetsAt, new Date('2026-11-16T00:00:00Z')),
    ).toEqual({ days: 0, hours: 0, minutes: 0 });
  });
});

describe('msUntilNextMinute', () => {
  it('다음 정각 분까지 남은 시간', () => {
    expect(msUntilNextMinute(new Date('2026-11-13T10:00:45.500Z'))).toBe(
      14_500,
    );
  });

  it('정확히 분 경계면 1분 뒤', () => {
    expect(msUntilNextMinute(new Date('2026-11-13T10:01:00.000Z'))).toBe(
      60_000,
    );
  });
});
