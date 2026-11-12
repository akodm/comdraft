import { describe, expect, it } from 'vitest';
import {
  clampModel,
  getAllowedModels,
  HAIKU_LONG_PROMPT_TOKENS,
  isModelAllowed,
  MODEL_USAGE_RATIO,
  usageCost,
} from '@/lib/generation/models';

const NONE = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };

describe('getAllowedModels', () => {
  it('등급별 허용 목록', () => {
    expect(getAllowedModels('basic')).toEqual(['haiku']);
    expect(getAllowedModels('pro')).toEqual(['haiku', 'sonnet']);
    expect(getAllowedModels('max')).toEqual(['haiku', 'sonnet', 'opus']);
  });

  it('모르는 등급과 빈 값은 haiku 만', () => {
    expect(getAllowedModels('unknown')).toEqual(['haiku']);
    expect(getAllowedModels(null)).toEqual(['haiku']);
    expect(getAllowedModels(undefined)).toEqual(['haiku']);
  });
});

describe('isModelAllowed', () => {
  it('등급에서 쓸 수 있는 모델만 true', () => {
    expect(isModelAllowed('pro', 'sonnet')).toBe(true);
    expect(isModelAllowed('pro', 'opus')).toBe(false);
    expect(isModelAllowed('basic', 'haiku')).toBe(true);
    expect(isModelAllowed('max', 'opus')).toBe(true);
  });
});

describe('clampModel', () => {
  it('쓸 수 없으면 허용 목록의 가장 높은 모델로 낮춘다', () => {
    expect(clampModel('pro', 'opus')).toBe('sonnet');
    expect(clampModel('basic', 'sonnet')).toBe('haiku');
    expect(clampModel(null, 'opus')).toBe('haiku');
  });

  it('쓸 수 있으면 그대로 둔다', () => {
    expect(clampModel('max', 'opus')).toBe('opus');
    expect(clampModel('pro', 'haiku')).toBe('haiku');
  });
});

describe('MODEL_USAGE_RATIO', () => {
  it('시작 배율', () => {
    expect(MODEL_USAGE_RATIO).toEqual({ haiku: 1, sonnet: 10, opus: 20 });
  });
});

describe('usageCost', () => {
  it('haiku 입력 1,000 + 출력 1,000 은 600 마이크로달러', () => {
    expect(usageCost('haiku', { ...NONE, input: 1_000, output: 1_000 })).toBe(
      600,
    );
  });

  it('opus 같은 양은 24,000 마이크로달러', () => {
    expect(usageCost('opus', { ...NONE, input: 1_000, output: 1_000 })).toBe(
      24_000,
    );
  });

  it('sonnet 도 단가대로 센다', () => {
    expect(usageCost('sonnet', { ...NONE, input: 1_000, output: 1_000 })).toBe(
      12_000,
    );
  });

  it('캐시 쓰기와 읽기를 함께 센다', () => {
    expect(
      usageCost('haiku', { ...NONE, cacheWrite: 1_000, cacheRead: 1_000 }),
    ).toBe(135);
    expect(
      usageCost('opus', { ...NONE, cacheWrite: 1_000, cacheRead: 1_000 }),
    ).toBe(5_200);
  });

  it('프롬프트 100,000 은 기본 구간이다', () => {
    expect(HAIKU_LONG_PROMPT_TOKENS).toBe(100_000);
    expect(
      usageCost('haiku', { ...NONE, input: 60_000, cacheRead: 40_000 }),
    ).toBe(6_400);
  });

  it('프롬프트 100,001 은 long 구간이라 모든 토큰이 비싸다', () => {
    expect(
      usageCost('haiku', { ...NONE, input: 60_000, cacheRead: 40_001 }),
    ).toBe(32_001);
    expect(usageCost('haiku', { ...NONE, input: 100_001, output: 1_000 })).toBe(
      50_001 + 2_500,
    );
  });

  it('sonnet·opus 는 프롬프트가 길어도 단가가 같다', () => {
    expect(usageCost('sonnet', { ...NONE, input: 200_000 })).toBe(400_000);
  });

  it('소수점은 올린다', () => {
    expect(usageCost('haiku', { ...NONE, input: 1 })).toBe(1);
    expect(usageCost('haiku', { ...NONE, cacheRead: 1 })).toBe(1);
    expect(usageCost('haiku', NONE)).toBe(0);
  });
});
