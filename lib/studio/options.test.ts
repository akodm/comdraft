import { describe, expect, it, vi } from 'vitest';

// vitest 는 Lingui 매크로를 변환하지 않으므로 라벨 정의만 통과시킴
vi.mock('@lingui/core/macro', () => ({ msg: (id: unknown) => id }));

import {
  DEFAULT_PROMPT_OPTIONS,
  parsePromptOptions,
} from '@/lib/studio/options';

const base = {
  tone: 'plain',
  postType: 'experience',
  length: 'medium',
  requiredBlocks: ['h2'],
};

describe('parsePromptOptions 의 model', () => {
  it('model 이 없으면 haiku 로 채운다', () => {
    expect(parsePromptOptions(base)?.model).toBe('haiku');
  });

  it('모르는 model 은 거부한다', () => {
    expect(parsePromptOptions({ ...base, model: 'gpt' })).toBeNull();
  });

  it('sonnet 은 그대로 받는다', () => {
    expect(parsePromptOptions({ ...base, model: 'sonnet' })?.model).toBe(
      'sonnet',
    );
  });

  it('기본 옵션의 model 은 haiku 다', () => {
    expect(DEFAULT_PROMPT_OPTIONS.model).toBe('haiku');
  });
});
