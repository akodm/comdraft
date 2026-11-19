import { describe, expect, it } from 'vitest';
import { getGenerationBlock } from '@/lib/generation/service-block';

const running = { paused: false, reason: null };
const paused = { paused: true, reason: '점검' };
const bannedAt = new Date('2026-11-18T00:00:00Z');

describe('getGenerationBlock', () => {
  it('AI 작성 중지가 사용자 밴보다 먼저', () =>
    expect(getGenerationBlock(paused, bannedAt)).toBe('service_paused'));

  it('중지가 아니면 밴 사용자는 user_banned', () =>
    expect(getGenerationBlock(running, bannedAt)).toBe('user_banned'));

  it('둘 다 아니면 막지 않음', () => {
    expect(getGenerationBlock(running, null)).toBeNull();
    expect(getGenerationBlock(running, undefined)).toBeNull();
  });
});
