'use client';

import { useActionState, useState } from 'react';
import { Trans } from '@lingui/react/macro';
import {
  ADMIN_ERROR_CLASS,
  ADMIN_TEXTAREA_CLASS,
} from '@/components/admin/admin-styles';
import SubmitButton from '@/components/shared/submit-button';
import { BRAND_BUTTON_CLASS } from '@/components/studio/studio-styles';
import {
  savePromptOverride,
  type SavePromptState,
} from '@/lib/actions/admin/ai-prompts';
import { PROMPT_MAX_LENGTH } from '@/lib/admin/prompt-validation';

interface PromptEditorFormProps {
  locale: string;
  promptKey: string;
  // 수정본이 있으면 수정본, 없으면 기본 문장
  initialContent: string;
}

const EMPTY_STATE: SavePromptState = {};

/**
 * 프롬프트 수정 문장 입력 폼
 * - 검사 실패(빈 문장·길이·필수 문자열 누락)는 폼 아래에 이유와 누락 목록을 보여 줌
 */
const PromptEditorForm = ({
  locale,
  promptKey,
  initialContent,
}: PromptEditorFormProps) => {
  const [state, formAction] = useActionState(savePromptOverride, EMPTY_STATE);
  const [content, setContent] = useState(initialContent);
  const [syncedContent, setSyncedContent] = useState(initialContent);

  // 입력 칸은 제어 컴포넌트로 두어 거부된 저장에도 입력이 유지됨
  // 서버 값이 바뀔 때(저장 성공·되돌리기·이력 복원)만 새 값으로 맞춤
  if (initialContent !== syncedContent) {
    setSyncedContent(initialContent);
    setContent(initialContent);
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="key" value={promptKey} />
      <textarea
        name="content"
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={24}
        spellCheck={false}
        className={`${ADMIN_TEXTAREA_CLASS} font-mono`}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton
          className={`h-9 ${BRAND_BUTTON_CLASS}`}
          pendingText={<Trans>저장 중...</Trans>}
        >
          <Trans>저장</Trans>
        </SubmitButton>
        {state.saved && content === syncedContent ? (
          <span role="status" className="text-[13px] text-ink-muted">
            <Trans>저장했어요</Trans>
          </span>
        ) : null}
      </div>
      <div role="alert" className="flex flex-col gap-1">
        {state.error === 'empty' ? (
          <p className={ADMIN_ERROR_CLASS}>
            <Trans>내용이 비어 있어요.</Trans>
          </p>
        ) : null}
        {state.error === 'too_long' ? (
          <p className={ADMIN_ERROR_CLASS}>
            <Trans>
              {PROMPT_MAX_LENGTH.toLocaleString('en-US')}자까지 저장할 수
              있어요.
            </Trans>
          </p>
        ) : null}
        {state.error === 'unchanged' ? (
          <p className={ADMIN_ERROR_CLASS}>
            <Trans>지금 저장된 내용과 같아요.</Trans>
          </p>
        ) : null}
        {state.error === 'missing_markers' ? (
          <>
            <p className={ADMIN_ERROR_CLASS}>
              <Trans>
                꼭 들어 있어야 하는 문자열이 빠졌어요. 아래 항목을 다시 넣어
                주세요.
              </Trans>
            </p>
            <ul className="flex flex-col gap-0.5">
              {(state.missing ?? []).map((marker) => (
                <li key={marker}>
                  <code className="text-[12px] break-all text-danger">
                    {marker}
                  </code>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </form>
  );
};

export default PromptEditorForm;
