'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Trans } from '@lingui/react/macro';
import DialogFrame from '@/components/shared/dialog-frame';
import {
  BRAND_BUTTON_CLASS,
  DANGER_BUTTON_CLASS,
  OUTLINE_BUTTON_CLASS,
} from '@/components/studio/studio-styles';

// 창을 연 뒤 남은 대기 시간(초, 올림), 0 이면 바로 누를 수 있음
const useCountdownSeconds = (delayMs: number) => {
  const [remainingMs, setRemainingMs] = useState(delayMs);

  useEffect(() => {
    if (delayMs <= 0) {
      return;
    }

    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const left = Math.max(0, delayMs - (Date.now() - startedAt));

      setRemainingMs(left);

      if (left === 0) {
        window.clearInterval(timer);
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [delayMs]);

  return Math.ceil(remainingMs / 1000);
};

interface ConfirmDialogProps {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  // 닫기 버튼 문구 (기본 "닫기")
  cancelLabel?: ReactNode;
  // danger 는 삭제처럼 되돌릴 수 없는 작업, default 는 일반 확인
  tone?: 'default' | 'danger';
  // 진행 중이면 확인 버튼을 막음
  isPending?: boolean;
  // 작업에 실패했을 때 창 안에 보일 문구
  error?: ReactNode;
  // 창을 연 뒤 이 시간(ms)이 지나야 확인 버튼을 누를 수 있음 (되돌릴 수 없는 작업을 실수로 바로 누르지 않도록, 남은 초를 버튼에 표시)
  confirmDelayMs?: number;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * 확인 창: 제목과 안내 문구, 닫기/확인 버튼
 * - 열 때마다 마운트하고, 확인해도 자동으로 닫히지 않음 (호출한 쪽이 닫음)
 */
const ConfirmDialog = ({
  title,
  description,
  confirmLabel,
  cancelLabel,
  tone = 'default',
  isPending = false,
  error,
  confirmDelayMs = 0,
  onConfirm,
  onClose,
}: ConfirmDialogProps) => {
  const remainingSeconds = useCountdownSeconds(confirmDelayMs);
  const isWaiting = remainingSeconds > 0;

  return (
    <DialogFrame title={title} onClose={onClose}>
      <div className="text-[13px] leading-[1.7] break-keep text-ink-muted">
        {description}
      </div>
      {error && (
        <p
          role="alert"
          className="text-[12px] leading-[1.6] break-keep text-danger"
        >
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className={`h-8.5 text-[12px] leading-[normal] font-medium ${OUTLINE_BUTTON_CLASS}`}
        >
          {cancelLabel ?? <Trans>닫기</Trans>}
        </button>
        <button
          type="button"
          disabled={isPending || isWaiting}
          aria-busy={isPending}
          onClick={onConfirm}
          className={`h-8.5 ${tone === 'danger' ? DANGER_BUTTON_CLASS : BRAND_BUTTON_CLASS}`}
        >
          {isWaiting ? `${confirmLabel} (${remainingSeconds})` : confirmLabel}
        </button>
      </div>
    </DialogFrame>
  );
};

export default ConfirmDialog;
