import { describe, expect, it } from 'vitest';
import {
  PROMPT_MAX_LENGTH,
  validatePromptOverride,
} from '@/lib/admin/prompt-validation';

describe('validatePromptOverride', () => {
  it('필수 문자열을 모두 담은 문장은 통과', () => {
    expect(
      validatePromptOverride('안녕 {{a}} {{b}}', ['{{a}}', '{{b}}']),
    ).toEqual({ ok: true });
  });

  it('필수 문자열이 없는 기본값이면 내용만 있으면 통과', () => {
    expect(validatePromptOverride('내용', [])).toEqual({ ok: true });
  });

  it('빈 문장과 공백뿐인 문장은 empty', () => {
    expect(validatePromptOverride('', [])).toEqual({
      ok: false,
      reason: 'empty',
    });
    expect(validatePromptOverride(' \n\t ', ['{{a}}'])).toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('20,000자는 통과, 20,001자는 too_long', () => {
    expect(PROMPT_MAX_LENGTH).toBe(20_000);
    expect(validatePromptOverride('a'.repeat(20_000), [])).toEqual({
      ok: true,
    });
    expect(validatePromptOverride('a'.repeat(20_001), [])).toEqual({
      ok: false,
      reason: 'too_long',
    });
  });

  it('필수 문자열이 빠지면 누락 목록과 함께 missing_markers', () => {
    expect(
      validatePromptOverride('{{a}} 만 있어요', ['{{a}}', '{{b}}', '{{c}}']),
    ).toEqual({
      ok: false,
      reason: 'missing_markers',
      missing: ['{{b}}', '{{c}}'],
    });
  });
});
