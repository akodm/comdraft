'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import Image from 'next/image';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  BRAND_BUTTON_CLASS,
  ICON_BUTTON_CLASS,
  OUTLINE_BUTTON_CLASS,
} from '@/components/studio/studio-styles';
import type { AddReferenceLinkStatus } from '@/hooks/use-reference-links';
import {
  MAX_REFERENCE_LINKS,
  parseReferenceUrl,
} from '@/lib/studio/reference-link';

type AddError = Exclude<AddReferenceLinkStatus, 'added'>;

const ERROR_MESSAGES: Record<AddError, MessageDescriptor> = {
  invalid: msg`올바른 URL을 입력해주세요.`,
  duplicate: msg`이미 추가한 링크입니다.`,
  limit: msg`참고 링크는 최대 ${MAX_REFERENCE_LINKS}개까지 추가할 수 있습니다.`,
  not_found: msg`초안을 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.`,
  error: msg`링크를 추가하지 못했습니다. 다시 시도해주세요.`,
};

interface ReferenceLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (url: string) => Promise<AddReferenceLinkStatus>;
}

/**
 * 참고 링크 추가 모달
 * - 브라우저 기본 모달 dialog: 바깥 영역 비활성(포커스 가둠), Escape 로 닫기, 닫으면 열었던 버튼으로 포커스 복귀
 * - 열려 있는 동안 뒤 화면 스크롤을 막음 (모바일 사이드바와 같은 방식)
 * - 주소 형식은 입력란을 벗어나거나 추가를 누를 때 확인하고, 서버에서 다시 확인
 */
const ReferenceLinkDialog = ({
  isOpen,
  onClose,
  onAdd,
}: ReferenceLinkDialogProps) => {
  const { t, i18n } = useLingui();
  const titleId = useId();
  const inputId = useId();
  const errorId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [isTouched, setIsTouched] = useState(false);
  const [serverError, setServerError] = useState<AddError | null>(null);
  const [isPending, setIsPending] = useState(false);

  const isEmpty = !value.trim();
  const isInvalid = isTouched && !isEmpty && !parseReferenceUrl(value);
  const error: AddError | null = isInvalid ? 'invalid' : serverError;

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog || !isOpen) {
      return;
    }

    const { style } = document.documentElement;
    const previousOverflow = style.overflow;

    dialog.showModal();
    inputRef.current?.focus();
    style.overflow = 'hidden';

    return () => {
      style.overflow = previousOverflow;
      dialog.close();
    };
  }, [isOpen]);

  // Escape, 닫기 버튼 모두 이 함수로 닫음 (입력 상태는 다음에 열 때 비어 있도록 초기화)
  const close = () => {
    setValue('');
    setIsTouched(false);
    setServerError(null);
    onClose();
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsTouched(true);

    if (isPending || !parseReferenceUrl(value)) {
      return;
    }

    setIsPending(true);
    const status = await onAdd(value);
    setIsPending(false);

    if (status === 'added') {
      close();
      return;
    }

    setServerError(status);
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-110 rounded-md border border-line bg-white p-0 text-ink backdrop:bg-ink/33"
    >
      <form
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        className="flex flex-col gap-6 p-4 pc:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id={titleId}
            className="text-[16px] leading-[normal] font-bold text-ink"
          >
            <Trans>참고 링크 추가</Trans>
          </h2>
          <button
            type="button"
            aria-label={t`닫기`}
            onClick={close}
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
        <div className="flex flex-col gap-2">
          <label
            htmlFor={inputId}
            className="text-[12px] leading-[normal] font-medium text-ink"
          >
            URL
          </label>
          <input
            ref={inputRef}
            id={inputId}
            type="text"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setServerError(null);
            }}
            onBlur={() => setIsTouched(true)}
            placeholder="https://"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            className={`h-10 w-full rounded border bg-white px-3 text-[12px] leading-[normal] text-ink outline-none placeholder:text-ink-subtle ${
              error ? 'border-danger' : 'border-line focus:border-brand'
            }`}
          />
          {error && (
            <p
              id={errorId}
              role="alert"
              className="text-[12px] leading-[1.6] break-keep text-danger"
            >
              {i18n._(ERROR_MESSAGES[error])}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            className={`h-8.5 text-[12px] leading-[normal] font-medium ${OUTLINE_BUTTON_CLASS}`}
          >
            <Trans>취소</Trans>
          </button>
          <button
            type="submit"
            disabled={isEmpty || isInvalid || isPending}
            aria-busy={isPending}
            className={`h-8.5 disabled:border-disabled disabled:bg-disabled disabled:text-ink-subtle disabled:opacity-100 ${BRAND_BUTTON_CLASS}`}
          >
            <Trans>추가</Trans>
          </button>
        </div>
      </form>
    </dialog>
  );
};

export default ReferenceLinkDialog;
