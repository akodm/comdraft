import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { GENERATION_ERROR_MESSAGES } from '@/components/studio/generation-progress';
import { NOTICE_MESSAGES } from '@/components/studio/prompt-composer';
import type { RequestBlankFillResult } from '@/lib/actions/generation';
import type { GenerationErrorCode } from '@/lib/generation/contract';
import type { Locale } from '@/lib/i18n/config';
import { formatQuotaReset } from '@/lib/generation/quota-format';

/**
 * 빈칸 AI 로 다듬기 안내 문구 (빈칸 아래에 보임)
 * - 시간당 제한·사용량·인증·서버 연결·시간 초과 안내는 작성 요청과 같은 문구
 */

export const BLANK_FILL_FAILED_MESSAGE = msg`빈칸을 다듬지 못했습니다. 다시 시도해 주세요.`;

// 이번 주 사용량을 모두 씀 (resetsAt: 표시할 초기화 시각)
const getQuotaExhaustedMessage = (resetsAt: string): MessageDescriptor =>
  msg`이번 주 사용 가능한 양을 모두 사용했습니다. ${resetsAt}에 초기화됩니다.`;

type FailedRequest = Exclude<RequestBlankFillResult, { status: 'started' }>;

// 빈칸 채우기 요청을 보내지 못한 이유
export const getBlankFillRequestMessage = (
  result: FailedRequest,
  locale: Locale,
): MessageDescriptor => {
  switch (result.status) {
    case 'quota_exhausted':
      return getQuotaExhaustedMessage(
        formatQuotaReset(new Date(result.resetsAt), locale),
      );
    case 'rate_limited':
    case 'quota_unavailable':
    case 'github_reauth':
    case 'runner_unavailable':
    case 'busy':
    case 'not_found':
      return NOTICE_MESSAGES[result.status];
    default:
      return BLANK_FILL_FAILED_MESSAGE;
  }
};

/**
 * 빈칸 채우기 작업이 실패한 이유 (작업이 생긴 뒤 Lambda·서버가 남긴 사유 코드)
 * - quota_exceeded: 사용량 소진 문구 (resetsAt 은 표시할 초기화 시각, 모르면 다시 시도 안내)
 * - timeout: 작성 시간 초과 문구 / 그 밖: 다시 시도 안내
 */
export const getBlankFillJobMessage = (
  errorCode: GenerationErrorCode | null,
  // 초기화 시각을 모르면(화면을 다시 열어 사용량 정보가 없을 때) null
  resetsAt: string | null,
): MessageDescriptor => {
  switch (errorCode) {
    case 'quota_exceeded':
      // 시각 없이 "다음 초기화에 초기화됩니다" 같은 어색한 문장이 되지 않도록 일반 실패 문구로
      return resetsAt
        ? getQuotaExhaustedMessage(resetsAt)
        : BLANK_FILL_FAILED_MESSAGE;
    case 'timeout':
      return GENERATION_ERROR_MESSAGES.timeout;
    default:
      return BLANK_FILL_FAILED_MESSAGE;
  }
};
