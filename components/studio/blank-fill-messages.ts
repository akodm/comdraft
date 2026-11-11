import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { NOTICE_MESSAGES } from '@/components/studio/prompt-composer';
import type { RequestBlankFillResult } from '@/lib/actions/generation';
import type { Locale } from '@/lib/i18n/config';
import { formatQuotaReset } from '@/lib/generation/quota-format';

/**
 * 빈칸 AI 로 다듬기 안내 문구 (빈칸 아래에 보임)
 * - 시간당 제한·사용량·인증·서버 연결 안내는 작성 요청과 같은 문구
 */

export const BLANK_FILL_FAILED_MESSAGE = msg`빈칸을 다듬지 못했습니다. 다시 시도해 주세요.`;

type FailedRequest = Exclude<RequestBlankFillResult, { status: 'started' }>;

// 빈칸 채우기 요청을 보내지 못한 이유
export const getBlankFillRequestMessage = (
  result: FailedRequest,
  locale: Locale,
): MessageDescriptor => {
  switch (result.status) {
    case 'quota_exhausted': {
      const resetsAt = formatQuotaReset(new Date(result.resetsAt), locale);

      return msg`이번 주 사용 가능한 양을 모두 사용했습니다. ${resetsAt}에 초기화됩니다.`;
    }
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
