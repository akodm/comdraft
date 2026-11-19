import type { AiGenerationSetting } from '@/lib/db/schema/admin';

// 작성 요청을 서비스 단위로 막는 이유 (contract 의 오류 코드와 같은 이름)
export type GenerationBlock = 'service_paused' | 'user_banned';

/**
 * 작성 요청을 받기 전 서비스 단위 검사 (AI 작성 중지 → 사용자 밴 순서)
 * - 막지 않으면 null
 */
export function getGenerationBlock(
  setting: AiGenerationSetting,
  bannedAt: Date | null | undefined,
): GenerationBlock | null {
  if (setting.paused) {
    return 'service_paused';
  }

  return bannedAt ? 'user_banned' : null;
}
