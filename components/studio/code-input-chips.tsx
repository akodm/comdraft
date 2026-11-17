'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import CodeInputDialog from '@/components/studio/code-input-dialog';
import { useStudio } from '@/components/studio/studio-context';
import { ICON_BUTTON_CLASS } from '@/components/studio/studio-styles';
import { countLines } from '@/lib/generation/code-input';
import { MAX_CODE_INPUTS } from '@/lib/generation/limits';

// 열려 있는 편집 모달: 새 코드(null) 또는 고칠 코드 위치
type Editing = { index: number | null } | null;

/**
 * 코드 직접 입력 버튼 (커밋 선택 버튼 옆, 최대 개수면 비활성)
 */
export const CodeInputButton = ({ disabled }: { disabled?: boolean }) => {
  const { codeInputs, saveCodeInput } = useStudio();
  const [isOpen, setIsOpen] = useState(false);
  const isFull = codeInputs.length >= MAX_CODE_INPUTS;

  return (
    <>
      <button
        type="button"
        disabled={disabled || isFull}
        onClick={() => setIsOpen(true)}
        className="flex h-7 items-center gap-1.5 rounded border border-line px-2 text-[11px] leading-[normal] whitespace-nowrap text-ink disabled:opacity-50"
      >
        <Image
          src="/images/studio/code-xml.svg"
          alt=""
          width={14}
          height={14}
        />
        <Trans>코드 직접 입력</Trans>
      </button>
      {isOpen && (
        <CodeInputDialog
          initial={null}
          existingNames={codeInputs.map(({ name }) => name)}
          onSave={(input) => {
            saveCodeInput(null, input);
            setIsOpen(false);
          }}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
};

/**
 * 넣은 코드 칩 (이름 · 줄 수, 누르면 다시 편집, X 로 빼기)
 */
export const CodeInputChips = () => {
  const { t } = useLingui();
  const { codeInputs, saveCodeInput, removeCodeInput } = useStudio();
  const [editing, setEditing] = useState<Editing>(null);

  if (codeInputs.length === 0) {
    return null;
  }

  const editingIndex = editing?.index ?? null;

  return (
    <>
      <ul className="flex max-w-full min-w-0 flex-wrap items-center gap-1.5">
        {codeInputs.map((input, index) => (
          <li
            key={`${index}-${input.name}`}
            className="flex h-6 max-w-full min-w-0 items-center rounded border border-line bg-panel text-[11px] leading-[normal]"
          >
            <button
              type="button"
              onClick={() => setEditing({ index })}
              aria-label={t`${input.name} 코드 편집`}
              className="flex min-w-0 items-center gap-1 px-1.5"
            >
              <Image
                src="/images/studio/code-xml.svg"
                alt=""
                width={12}
                height={12}
              />
              <span className="truncate font-mono text-ink-muted">
                {input.name}
              </span>
              <span className="shrink-0 text-ink-faint">
                · <Plural value={countLines(input.code)} other="#줄" />
              </span>
            </button>
            <button
              type="button"
              aria-label={t`${input.name} 코드 빼기`}
              onClick={() => removeCodeInput(index)}
              className={`size-6 shrink-0 ${ICON_BUTTON_CLASS}`}
            >
              <Image
                src="/images/studio/chip-x.svg"
                alt=""
                width={10}
                height={10}
              />
            </button>
          </li>
        ))}
      </ul>
      {editing && editingIndex !== null && codeInputs[editingIndex] && (
        <CodeInputDialog
          initial={codeInputs[editingIndex]}
          existingNames={codeInputs
            .filter((_, i) => i !== editingIndex)
            .map(({ name }) => name)}
          onSave={(input) => {
            saveCodeInput(editingIndex, input);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
};
