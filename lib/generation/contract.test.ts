import { describe, expect, it } from 'vitest';
import { isGenerationErrorCode } from '@/lib/generation/contract';

describe('isGenerationErrorCode', () => {
  it.each([
    'no_preset',
    'no_commits',
    'anchor_missing',
    'rate_limited',
    'too_many_active',
    'quota_unavailable',
    'model_locked',
    'timeout',
  ])('%s 는 실패 코드', (code) => {
    expect(isGenerationErrorCode(code)).toBe(true);
  });

  it('모르는 값은 거부', () => {
    expect(isGenerationErrorCode('nope')).toBe(false);
    expect(isGenerationErrorCode(null)).toBe(false);
  });
});
