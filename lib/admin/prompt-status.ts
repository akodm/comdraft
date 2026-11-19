import { validatePromptOverride } from '@/lib/admin/prompt-validation';

// default: 수정본 없음, applied: 수정본 적용 중, ignored: 수정본이 있지만 Lambda 가 무시함
export type PromptStatus = 'default' | 'applied' | 'ignored';

export interface PromptStatusResult {
  status: PromptStatus;
  // ignored 일 때 빠진 필수 문자열
  missing: string[];
}

/**
 * 수정본의 실제 적용 상태 계산
 * - Lambda 배포로 기본값의 필수 문자열이 늘면 기존 수정본이 조용히 무시되므로, 같은 검사로 다시 확인
 */
export function derivePromptStatus(
  overrideContent: string | null,
  requiredMarkers: string[],
): PromptStatusResult {
  if (overrideContent === null) {
    return { status: 'default', missing: [] };
  }

  const result = validatePromptOverride(overrideContent, requiredMarkers);

  if (result.ok) {
    return { status: 'applied', missing: [] };
  }

  return { status: 'ignored', missing: result.missing ?? [] };
}
