'use client';

import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import { useModalDialog } from '@/components/shared/dialog-frame';
import Spinner from '@/components/shared/spinner';
import {
  BRAND_BUTTON_CLASS,
  ICON_BUTTON_CLASS,
  OUTLINE_BUTTON_CLASS,
} from '@/components/studio/studio-styles';
import {
  countLines,
  isValidCodeInputName,
  nextCodeInputNumber,
  normalizeCode,
} from '@/lib/generation/code-input';
import type { GenerationCodeInput } from '@/lib/generation/contract';
import {
  MAX_CODE_INPUT_CHARS,
  MAX_CODE_INPUT_LINES,
  MAX_CODE_INPUT_NAME_CHARS,
} from '@/lib/generation/limits';

// 편집기(CodeMirror)는 모달을 열 때만 불러옴
const CodeInputEditor = dynamic(
  () => import('@/components/studio/code-input-editor'),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded border border-line">
        <Spinner label={<Trans>편집기를 불러오는 중...</Trans>} />
      </div>
    ),
  },
);

export interface CodeInputDialogProps {
  // 고칠 코드 (null 이면 새 코드)
  initial: GenerationCodeInput | null;
  // 다른 코드의 이름 (이름을 비웠을 때 "코드 N" 번호를 고르는 데 씀)
  existingNames: string[];
  // 되묻기 재입력: 이름을 바꿀 수 없고 처음 줄 수를 안내
  fixed?: { name: string; lines: number };
  onSave: (input: GenerationCodeInput) => void;
  onClose: () => void;
}

/**
 * 코드 직접 입력 모달 (PC 가운데 대화상자, 모바일 전체 화면)
 * - 마운트하는 동안 열림: 포커스 가둠, Escape 로 닫기, 닫으면 연 버튼으로 포커스 복귀
 * - 작성 요청 입력창(form) 밖 body 에 띄우고, 키 입력·제출이 입력창으로 전달되지 않게 막음
 * - 코드는 이 화면 상태로만 들고 있고 저장하지 않음
 */
const CodeInputDialog = ({
  initial,
  existingNames,
  fixed,
  onSave,
  onClose,
}: CodeInputDialogProps) => {
  const { t } = useLingui();
  const titleId = useId();
  const nameId = useId();
  const hintId = useId();
  const dialogRef = useModalDialog();
  const [name, setName] = useState(fixed?.name ?? initial?.name ?? '');
  const [code, setCode] = useState(initial?.code ?? '');

  const normalized = normalizeCode(code);
  const isEmpty = !normalized.trim();
  const lines = isEmpty ? 0 : countLines(normalized);
  const trimmedName = name.trim();
  const tooManyLines = lines > MAX_CODE_INPUT_LINES;
  const tooManyChars = normalized.length > MAX_CODE_INPUT_CHARS;
  const invalidName = trimmedName !== '' && !isValidCodeInputName(trimmedName);
  const charCount = normalized.length.toLocaleString();
  const maxChars = MAX_CODE_INPUT_CHARS.toLocaleString();
  const linesMismatch = Boolean(fixed) && !isEmpty && lines !== fixed?.lines;
  const canSave =
    !isEmpty &&
    !tooManyLines &&
    !tooManyChars &&
    !invalidName &&
    !linesMismatch;

  const save = () => {
    if (!canSave) {
      return;
    }

    const baseLabel = t`코드`;
    const finalName =
      trimmedName ||
      `${baseLabel} ${nextCodeInputNumber(existingNames, baseLabel)}`;

    onSave({ name: finalName, code: normalized });
  };

  return createPortal(
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // 포털이어도 React 이벤트는 컴포넌트 트리를 따라 올라가므로 바깥 입력창으로 보내지 않음
      onKeyDown={(event) => event.stopPropagation()}
      onSubmit={(event) => event.stopPropagation()}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-white p-0 text-ink backdrop:bg-ink/33 pc:m-auto pc:h-[min(720px,calc(100dvh-64px))] pc:w-[calc(100%-64px)] pc:max-w-200 pc:rounded-md pc:border pc:border-line"
    >
      <div className="flex h-full flex-col gap-4 p-4 pc:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2
            id={titleId}
            className="text-[16px] leading-[normal] font-bold text-ink"
          >
            {fixed ? (
              <Trans>코드 다시 넣기</Trans>
            ) : (
              <Trans>코드 직접 입력</Trans>
            )}
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
        <div className="flex flex-col gap-2">
          <label
            htmlFor={nameId}
            className="text-[12px] leading-[normal] font-medium text-ink"
          >
            <Trans>이름</Trans>
          </label>
          <input
            id={nameId}
            type="text"
            value={name}
            readOnly={Boolean(fixed)}
            maxLength={MAX_CODE_INPUT_NAME_CHARS}
            spellCheck={false}
            autoComplete="off"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
              }
            }}
            placeholder={t`파일 이름 (예: useAuth.ts, 비우면 "코드 N")`}
            aria-invalid={invalidName}
            className={`h-10 w-full rounded border bg-white px-3 font-mono text-[12px] leading-[normal] text-ink outline-none read-only:bg-surface placeholder:font-sans placeholder:text-ink-subtle ${
              invalidName ? 'border-danger' : 'border-line focus:border-brand'
            }`}
          />
        </div>
        <div className="min-h-60 flex-1">
          <CodeInputEditor
            initialValue={initial?.code ?? ''}
            onChange={setCode}
            label={t`코드`}
            placeholder={t`코드를 붙여 넣거나 입력해주세요.`}
          />
        </div>
        <div className="flex flex-col gap-1.5 text-[11px] leading-[1.6] break-keep pc:text-[12px]">
          <p
            className={`font-mono ${
              tooManyLines || tooManyChars ? 'text-danger' : 'text-ink-faint'
            }`}
          >
            <Plural value={lines} other="#줄" />
            {' · '}
            <Trans>
              {charCount} / {maxChars}자
            </Trans>
          </p>
          {(tooManyLines || tooManyChars) && (
            <p role="alert" className="text-danger">
              <Trans>
                코드 하나는 {MAX_CODE_INPUT_LINES}줄, {maxChars}자까지 넣을 수
                있습니다.
              </Trans>
            </p>
          )}
          {invalidName && (
            <p role="alert" className="text-danger">
              <Trans>이름에는 탭이나 줄바꿈을 넣을 수 없습니다.</Trans>
            </p>
          )}
          {fixed && linesMismatch && (
            <p role="alert" className="text-danger">
              <Plural
                value={fixed.lines}
                other="처음 넣은 코드는 #줄입니다. 같은 코드를 넣어주세요."
              />
            </p>
          )}
          <p id={hintId} className="text-ink-faint">
            <Trans>
              넣은 코드는 저장하지 않고 AI 작성에만 씁니다. 요청 문구에 붙인
              코드는 저장됩니다.
            </Trans>
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`h-8.5 text-[12px] leading-[normal] font-medium ${OUTLINE_BUTTON_CLASS}`}
          >
            <Trans>취소</Trans>
          </button>
          <button
            type="button"
            disabled={!canSave}
            aria-describedby={hintId}
            onClick={save}
            className={`h-8.5 disabled:border-disabled disabled:bg-disabled disabled:text-ink-subtle disabled:opacity-100 ${BRAND_BUTTON_CLASS}`}
          >
            <Trans>넣기</Trans>
          </button>
        </div>
      </div>
    </dialog>,
    document.body,
  );
};

export default CodeInputDialog;
