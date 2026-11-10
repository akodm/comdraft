'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import Image from 'next/image';
import { useLingui } from '@lingui/react/macro';
import { ICON_BUTTON_CLASS } from '@/components/studio/studio-styles';

/**
 * 브라우저 기본 모달 dialog 를 마운트하는 동안 띄움
 * - 바깥 영역 비활성(포커스 가둠), Escape 로 닫기, 닫으면 열었던 버튼으로 포커스 복귀
 * - 열려 있는 동안 뒤 화면 스크롤을 막음
 */
const useModalDialog = () => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    const { style } = document.documentElement;
    const previousOverflow = style.overflow;
    // 닫을 때 돌아갈 포커스 (언마운트로 닫히면 브라우저가 포커스를 되돌려 주지 않아 직접 복귀)
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    dialog.showModal();
    style.overflow = 'hidden';

    return () => {
      style.overflow = previousOverflow;
      dialog.close();

      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  return dialogRef;
};

const DIALOG_CLASS =
  'm-auto w-[calc(100%-32px)] max-w-110 rounded-md border border-line bg-white p-0 text-ink backdrop:bg-ink/33';

interface DialogFrameProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// 제목 줄과 닫기 버튼이 있는 모달 틀
const DialogFrame = ({ title, onClose, children }: DialogFrameProps) => {
  const { t } = useLingui();
  const titleId = useId();
  const dialogRef = useModalDialog();

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={DIALOG_CLASS}
    >
      <div className="flex flex-col gap-6 p-4 pc:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2
            id={titleId}
            className="text-[16px] leading-[normal] font-bold text-ink"
          >
            {title}
          </h2>
          <button
            type="button"
            aria-label={t`닫기`}
            onClick={onClose}
            className={`size-7 ${ICON_BUTTON_CLASS}`}
          >
            <Image
              src="/images/studio/close-18.svg"
              alt=""
              width={18}
              height={18}
            />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
};

export default DialogFrame;
