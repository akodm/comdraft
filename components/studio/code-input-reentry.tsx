'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Plural, Trans, useLingui } from '@lingui/react/macro';
import CodeInputDialog from '@/components/studio/code-input-dialog';
import { OUTLINE_BUTTON_CLASS } from '@/components/studio/studio-styles';
import type {
  CodeInputMeta,
  GenerationCodeInput,
} from '@/lib/generation/contract';

interface CodeInputReentryProps {
  // 처음 요청에 넣은 코드의 이름·줄 수 (요청 순서)
  meta: CodeInputMeta[];
  disabled: boolean;
  // 모든 코드를 다시 넣었을 때 (요청 순서)
  onComplete: (inputs: GenerationCodeInput[]) => void;
}

/**
 * 되묻기 카드의 직접 입력 코드 다시 넣기
 * - 코드는 저장하지 않아, 새로고침이나 다른 기기에서는 답하기 전에 같은 코드를 다시 넣어야 함
 * - 이름은 처음 그대로 고정하고, 줄 수가 처음과 같아야 넣을 수 있음 (서버와 Lambda 도 같은 기준으로 확인)
 */
const CodeInputReentry = ({
  meta,
  disabled,
  onComplete,
}: CodeInputReentryProps) => {
  const { t } = useLingui();
  const [entries, setEntries] = useState<Array<GenerationCodeInput | null>>(
    () => meta.map(() => null),
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const editing = editingIndex === null ? null : meta[editingIndex];

  const save = (index: number, input: GenerationCodeInput) => {
    const next = entries.map((entry, i) => (i === index ? input : entry));

    setEntries(next);
    setEditingIndex(null);

    if (next.every((entry) => entry !== null)) {
      onComplete(next as GenerationCodeInput[]);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded border border-line bg-white px-3 py-2.5">
      <p className="break-keep text-ink">
        <Trans>
          직접 입력한 코드는 저장하지 않아서, 답하기 전에 같은 코드를 다시
          넣어주세요.
        </Trans>
      </p>
      <ul className="flex flex-col gap-1.5">
        {meta.map(({ name, lines }, index) => (
          <li
            key={`${index}-${name}`}
            className="flex min-w-0 items-center justify-between gap-2"
          >
            <span className="flex min-w-0 items-center gap-1 text-ink-muted">
              <Image
                src="/images/studio/code-xml.svg"
                alt=""
                width={12}
                height={12}
              />
              <span className="truncate font-mono">{name}</span>
              <span className="shrink-0 text-ink-faint">
                · <Plural value={lines} other="#줄" />
              </span>
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setEditingIndex(index)}
              aria-label={t`${name} 코드 다시 넣기`}
              className={`h-7 shrink-0 text-[11px] ${OUTLINE_BUTTON_CLASS}`}
            >
              {entries[index] ? (
                <Trans>넣음 · 고치기</Trans>
              ) : (
                <Trans>넣기</Trans>
              )}
            </button>
          </li>
        ))}
      </ul>
      {editing && editingIndex !== null && (
        <CodeInputDialog
          initial={entries[editingIndex]}
          existingNames={[]}
          fixed={editing}
          onSave={(input) => save(editingIndex, input)}
          onClose={() => setEditingIndex(null)}
        />
      )}
    </div>
  );
};

export default CodeInputReentry;
