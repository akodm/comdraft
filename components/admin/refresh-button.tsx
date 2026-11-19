'use client';

import { useTransition } from 'react';
import { Trans } from '@lingui/react/macro';
import { RefreshCw } from 'lucide-react';
import { OUTLINE_BUTTON_CLASS } from '@/components/studio/studio-styles';
import { useLocalizedRouter } from '@/hooks/use-localized-router';

interface RefreshButtonProps {
  // 서버가 화면을 만든 시각 (새로고침하면 서버가 다시 만들어 갱신됨)
  readAt: string;
}

/**
 * 대시보드 새로고침 버튼
 * - 자동 갱신 없이 누를 때만 서버 데이터를 다시 읽음
 */
const RefreshButton = ({ readAt }: RefreshButtonProps) => {
  const router = useLocalizedRouter();
  const [pending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-[12px] text-ink-faint">
        <Trans>마지막으로 읽은 시각 {readAt}</Trans>
      </span>
      <button
        type="button"
        onClick={handleRefresh}
        disabled={pending}
        aria-busy={pending}
        className={`${OUTLINE_BUTTON_CLASS} h-8 text-[12px]`}
      >
        <RefreshCw
          aria-hidden="true"
          className={`size-3.5 ${pending ? 'animate-spin' : ''}`}
        />
        {pending ? <Trans>읽는 중</Trans> : <Trans>새로고침</Trans>}
      </button>
    </div>
  );
};

export default RefreshButton;
