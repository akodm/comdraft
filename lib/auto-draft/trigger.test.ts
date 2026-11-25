import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROMPT_OPTIONS } from '@/lib/studio/options';
import { mergeTriggerOptions, parseTrigger } from '@/lib/auto-draft/trigger';

// options.ts 가 Lingui 매크로를 쓰므로 테스트에서는 대체한다
vi.mock('@lingui/core/macro', () => ({ msg: (id: unknown) => id }));

describe('parseTrigger', () => {
  it('태그만 있으면 빈 옵션', () => {
    expect(parseTrigger('[comdraft]')).toEqual({});
  });

  it('옵션 단어를 읽는다', () => {
    expect(parseTrigger('[comdraft] friendly short')).toEqual({
      tone: 'friendly',
      length: 'short',
    });
  });

  it('공백·탭 연속과 대소문자를 허용한다', () => {
    expect(parseTrigger('[comdraft]  LECTURE\tlong')).toEqual({
      postType: 'lecture',
      length: 'long',
    });
  });

  it('같은 종류는 앞의 값을 쓴다', () => {
    expect(parseTrigger('[comdraft] short long')).toEqual({ length: 'short' });
  });

  it('모르는 단어는 무시한다', () => {
    expect(parseTrigger('[comdraft] hello short')).toEqual({ length: 'short' });
  });

  it('첫 줄만 본다', () => {
    expect(parseTrigger('[comdraft] plain\n\nbody short')).toEqual({
      tone: 'plain',
    });
    expect(parseTrigger('[comdraft] plain\r\nbody short')).toEqual({
      tone: 'plain',
    });
  });

  it('태그 뒤가 줄 끝일 때 줄바꿈도 허용한다', () => {
    expect(parseTrigger('[comdraft]\nbody short')).toEqual({});
  });

  it.each(['[Comdraft]', '[comdraft]x', 'fix [comdraft]', ' [comdraft]', ''])(
    '트리거가 아니면 null: %j',
    (message) => {
      expect(parseTrigger(message)).toBeNull();
    },
  );
});

describe('mergeTriggerOptions', () => {
  it('트리거에 지정된 값만 바꾼다', () => {
    const merged = mergeTriggerOptions(DEFAULT_PROMPT_OPTIONS, {
      length: 'long',
    });
    expect(merged).toEqual({ ...DEFAULT_PROMPT_OPTIONS, length: 'long' });
    expect(merged).not.toBe(DEFAULT_PROMPT_OPTIONS);
  });
});
