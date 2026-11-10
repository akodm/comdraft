'use client';

import { Trans } from '@lingui/react/macro';
import { useLocale } from '@/hooks/use-locale';
import { formatQuotaReset } from '@/lib/generation/quota-format';

interface QuotaExhaustedBannerProps {
  // 초기화 시각 (ISO)
  resetsAtIso: string;
  onDismiss: () => void;
}

/**
 * [임시 디자인] 작성은 끝났지만 이번 주 사용량을 모두 쓴 경우 편집기 위에 띄우는 안내
 * - 닫을 때까지 유지 (결과 반영 후 화면을 다시 불러와도 사라지지 않음)
 */
const QuotaExhaustedBanner = ({
  resetsAtIso,
  onDismiss,
}: QuotaExhaustedBannerProps) => {
  const locale = useLocale();
  const resetsAt = formatQuotaReset(new Date(resetsAtIso), locale);

  return (
    <div
      role="status"
      className="flex shrink-0 items-start justify-between gap-3 rounded bg-surface px-3 py-2 text-[11px] leading-[1.6] text-ink-muted pc:text-[12px]"
    >
      <p className="break-keep">
        <Trans>
          이번 주 사용 가능한 양을 모두 사용했습니다. {resetsAt}에 초기화됩니다.
        </Trans>
      </p>
      <button type="button" onClick={onDismiss} className="shrink-0 underline">
        <Trans>닫기</Trans>
      </button>
    </div>
  );
};

export default QuotaExhaustedBanner;
