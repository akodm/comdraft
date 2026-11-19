import { describe, expect, it, vi } from 'vitest';

// server-only 는 서버 컴포넌트 밖에서 import 하면 던지므로 테스트에서는 비운다
vi.mock('server-only', () => ({}));
// DB 연결 없이 값 해석만 확인
vi.mock('@/lib/db', () => ({ db: {} }));

const { parseAiGenerationSetting } =
  await import('@/lib/admin/service-setting');

describe('parseAiGenerationSetting', () => {
  it('행이 없으면 작성 가능', () =>
    expect(parseAiGenerationSetting(undefined)).toEqual({
      paused: false,
      reason: null,
    }));

  it('중지 값과 사유를 그대로 읽음', () =>
    expect(parseAiGenerationSetting({ paused: true, reason: '점검' })).toEqual({
      paused: true,
      reason: '점검',
    }));

  it('형식이 깨진 값은 중지가 아닌 것으로 봄', () => {
    expect(parseAiGenerationSetting('paused')).toEqual({
      paused: false,
      reason: null,
    });
    expect(parseAiGenerationSetting({ paused: 'yes' })).toEqual({
      paused: false,
      reason: null,
    });
    expect(parseAiGenerationSetting([true])).toEqual({
      paused: false,
      reason: null,
    });
  });

  it('사유가 문자열이 아니면 null', () =>
    expect(parseAiGenerationSetting({ paused: true, reason: 3 })).toEqual({
      paused: true,
      reason: null,
    }));
});
