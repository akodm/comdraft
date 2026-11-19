'use client';

import { useId, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Trans } from '@lingui/react/macro';
import {
  ADMIN_LABEL_CLASS,
  ADMIN_TEXTAREA_CLASS,
} from '@/components/admin/admin-styles';
import DialogFrame from '@/components/shared/dialog-frame';
import {
  BRAND_BUTTON_CLASS,
  DANGER_BUTTON_CLASS,
  OUTLINE_BUTTON_CLASS,
} from '@/components/studio/studio-styles';

// 조치 사유 최대 길이 (서버 액션도 같은 기준으로 다시 확인)
const REASON_MAX_LENGTH = 500;

// 표 안에 놓이는 작은 테두리 버튼 (글자색은 조치 종류에 따라 붙임)
const TRIGGER_CLASS =
  'flex h-8 items-center justify-center border border-line bg-white px-3 text-[12px] leading-[normal] font-medium whitespace-nowrap transition-colors hover:border-ink-faint hover:bg-surface';

interface DialogActionsProps {
  confirmLabel: string;
  danger: boolean;
  onCancel: () => void;
}

// 확인 창 아래 버튼 (처리 중에는 둘 다 막음)
const DialogActions = ({
  confirmLabel,
  danger,
  onCancel,
}: DialogActionsProps) => {
  const { pending } = useFormStatus();

  return (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={onCancel}
        className={`h-8.5 text-[12px] leading-[normal] font-medium ${OUTLINE_BUTTON_CLASS}`}
      >
        <Trans>취소</Trans>
      </button>
      <button
        type="submit"
        disabled={pending}
        aria-busy={pending}
        className={`h-8.5 ${danger ? DANGER_BUTTON_CLASS : BRAND_BUTTON_CLASS}`}
      >
        {pending ? <Trans>처리 중...</Trans> : confirmLabel}
      </button>
    </div>
  );
};

interface ConfirmActionButtonProps {
  // 서버 액션 (권한 검사는 액션이 다시 함)
  action: (formData: FormData) => Promise<void>;
  // 버튼 문구이자 확인 창 제목
  label: string;
  // 확인 창의 실행 버튼 문구
  confirmLabel: string;
  // 확인 창 안내 문구
  description?: ReactNode;
  // 삭제·밴·중지처럼 되돌리기 어려운 조치
  danger?: boolean;
  // 사유를 받아 reason 필드로 보냄 (필수 입력)
  reasonField?: boolean;
  // 함께 보낼 값 (대상 id 등)
  hidden?: Record<string, string>;
}

/**
 * 확인 단계를 거치는 어드민 조치 버튼
 * - 누르면 확인 창을 띄우고, 확인하면 hidden 값과 사유를 담아 서버 액션을 부름
 * - 액션이 끝나면 창을 닫음 (실패는 오류 화면으로 넘김)
 */
const ConfirmActionButton = ({
  action,
  label,
  confirmLabel,
  description,
  danger = false,
  reasonField = false,
  hidden = {},
}: ConfirmActionButtonProps) => {
  const reasonId = useId();
  const [isOpen, setIsOpen] = useState(false);

  const submit = async (formData: FormData) => {
    await action(formData);
    setIsOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={`${TRIGGER_CLASS} ${danger ? 'text-danger' : 'text-ink'}`}
      >
        {label}
      </button>
      {isOpen && (
        <DialogFrame title={label} onClose={() => setIsOpen(false)}>
          <form action={submit} className="flex flex-col gap-5">
            {Object.entries(hidden).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            {description && (
              <div className="text-[13px] leading-[1.7] break-keep text-ink-muted">
                {description}
              </div>
            )}
            {reasonField && (
              <div className="flex flex-col gap-2">
                <label htmlFor={reasonId} className={ADMIN_LABEL_CLASS}>
                  <Trans>사유</Trans>
                </label>
                <textarea
                  id={reasonId}
                  name="reason"
                  required
                  maxLength={REASON_MAX_LENGTH}
                  rows={3}
                  className={ADMIN_TEXTAREA_CLASS}
                />
              </div>
            )}
            <DialogActions
              confirmLabel={confirmLabel}
              danger={danger}
              onCancel={() => setIsOpen(false)}
            />
          </form>
        </DialogFrame>
      )}
    </>
  );
};

export default ConfirmActionButton;
