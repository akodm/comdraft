import { describe, expect, it } from 'vitest';
import {
  GENERATION_HOURLY_LIMIT,
  MAX_ACTIVE_GENERATIONS,
} from '@/lib/generation/limits';
import { decideGenerationSlot } from '@/lib/generation/slot';

describe('decideGenerationSlot', () => {
  it('동시에 2개까지 진행', () => {
    expect(MAX_ACTIVE_GENERATIONS).toBe(2);
  });

  it('시간당 요청 수와 진행 중 작업 수가 한도 아래면 ok', () => {
    expect(decideGenerationSlot({ recentJobs: 0, activeJobs: 0 })).toBe('ok');
    expect(
      decideGenerationSlot({
        recentJobs: GENERATION_HOURLY_LIMIT - 1,
        activeJobs: MAX_ACTIVE_GENERATIONS - 1,
      }),
    ).toBe('ok');
  });

  it('시간당 요청 수가 한도에 닿으면 rate_limited', () => {
    expect(
      decideGenerationSlot({
        recentJobs: GENERATION_HOURLY_LIMIT,
        activeJobs: 0,
      }),
    ).toBe('rate_limited');
  });

  it('진행 중(queued·running) 작업이 2개 이상이면 too_many_active', () => {
    expect(
      decideGenerationSlot({
        recentJobs: 2,
        activeJobs: MAX_ACTIVE_GENERATIONS,
      }),
    ).toBe('too_many_active');
    expect(decideGenerationSlot({ recentJobs: 5, activeJobs: 3 })).toBe(
      'too_many_active',
    );
  });

  it('둘 다 넘으면 시간당 제한을 먼저 알림', () => {
    expect(
      decideGenerationSlot({
        recentJobs: GENERATION_HOURLY_LIMIT,
        activeJobs: MAX_ACTIVE_GENERATIONS,
      }),
    ).toBe('rate_limited');
  });
});
