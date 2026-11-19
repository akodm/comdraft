import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  AI_GENERATION_SETTING_KEY,
  serviceSetting,
  type AiGenerationSetting,
} from '@/lib/db/schema/admin';

// 행이 없거나 값을 읽을 수 없을 때 (작성 가능)
const AI_GENERATION_RUNNING: AiGenerationSetting = {
  paused: false,
  reason: null,
};

/**
 * service_setting 의 ai_generation 값 해석
 * - 형식이 깨진 값은 중지가 아닌 것으로 봄 (잘못 저장된 값 때문에 서비스 전체가 멈추지 않도록)
 */
export function parseAiGenerationSetting(value: unknown): AiGenerationSetting {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    !('paused' in value) ||
    typeof value.paused !== 'boolean'
  ) {
    return AI_GENERATION_RUNNING;
  }

  return {
    paused: value.paused,
    reason:
      'reason' in value && typeof value.reason === 'string'
        ? value.reason
        : null,
  };
}

// 지금의 AI 작성 중지 설정 (행이 없으면 작성 가능)
export async function getAiGenerationSetting(): Promise<AiGenerationSetting> {
  const [row] = await db
    .select({ value: serviceSetting.value })
    .from(serviceSetting)
    .where(eq(serviceSetting.key, AI_GENERATION_SETTING_KEY))
    .limit(1);

  return parseAiGenerationSetting(row?.value);
}
