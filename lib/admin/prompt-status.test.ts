import { describe, expect, it } from 'vitest';
import { derivePromptStatus } from '@/lib/admin/prompt-status';

describe('derivePromptStatus', () => {
  it('수정본이 없으면 default', () => {
    expect(derivePromptStatus(null, ['{{a}}'])).toEqual({
      status: 'default',
      missing: [],
    });
  });

  it('필수 문자열을 모두 담은 수정본은 applied', () => {
    expect(derivePromptStatus('hi {{a}}', ['{{a}}'])).toEqual({
      status: 'applied',
      missing: [],
    });
  });

  it('기본값에 필수 문자열이 새로 생겨 빠지면 ignored 와 누락 목록', () => {
    expect(derivePromptStatus('hi {{a}}', ['{{a}}', '{{b}}'])).toEqual({
      status: 'ignored',
      missing: ['{{b}}'],
    });
  });

  it('빈 수정본은 누락 목록 없이 ignored', () => {
    expect(derivePromptStatus('  ', [])).toEqual({
      status: 'ignored',
      missing: [],
    });
  });
});
