// 프롬프트 수정본 최대 길이
export const PROMPT_MAX_LENGTH = 20_000;

export type PromptValidation =
  | { ok: true }
  | {
      ok: false;
      reason: 'empty' | 'too_long' | 'missing_markers';
      missing?: string[];
    };

/**
 * 프롬프트 수정본 검사 (Lambda 가 수정본을 받아들이는 조건과 같은 기준)
 * - 공백을 뗀 뒤 비어 있으면 거부, 기본값의 필수 문자열이 하나라도 없으면 거부
 * - Lambda 는 조건에 안 맞는 수정본을 조용히 무시하고 기본값을 쓰므로, 저장 단계에서 막아야 함
 */
export function validatePromptOverride(
  content: string,
  requiredMarkers: string[],
): PromptValidation {
  if (content.trim() === '') {
    return { ok: false, reason: 'empty' };
  }

  if (content.length > PROMPT_MAX_LENGTH) {
    return { ok: false, reason: 'too_long' };
  }

  const missing = requiredMarkers.filter((marker) => !content.includes(marker));

  if (missing.length > 0) {
    return { ok: false, reason: 'missing_markers', missing };
  }

  return { ok: true };
}
