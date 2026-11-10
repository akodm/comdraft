'use client';

import type { ReactNode } from 'react';
import { Trans } from '@lingui/react/macro';
import DialogFrame from '@/components/shared/dialog-frame';
import {
  BRAND_BUTTON_CLASS,
  OUTLINE_BUTTON_CLASS,
} from '@/components/studio/studio-styles';

// 삭제처럼 되돌릴 수 없는 작업의 확인 버튼 색
const DANGER_BUTTON_CLASS = BRAND_BUTTON_CLASS.replaceAll(
  /\b(border|bg)-brand\b/g,
  '$1-danger',
);

interface ConfirmDialogProps {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  // danger 는 삭제처럼 되돌릴 수 없는 작업, default 는 일반 확인
  tone?: 'default' | 'danger';
  // 진행 중이면 확인 버튼을 막음
  isPending?: boolean;
  // 작업에 실패했을 때 창 안에 보일 문구
  error?: ReactNode;
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
  tone = 'default',
  isPending = false,
  error,
  onConfirm,
  onClose,
}: ConfirmDialogProps) => (
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
        <Trans>닫기</Trans>
      </button>
      <button
        type="button"
        disabled={isPending}
        aria-busy={isPending}
        onClick={onConfirm}
        className={`h-8.5 ${tone === 'danger' ? DANGER_BUTTON_CLASS : BRAND_BUTTON_CLASS}`}
      >
        {confirmLabel}
      </button>
    </div>
  </DialogFrame>
);

export default ConfirmDialog;
