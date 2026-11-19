'use client';

import { useActionState, useId } from 'react';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  ADMIN_ERROR_CLASS,
  ADMIN_INPUT_CLASS,
  ADMIN_LABEL_CLASS,
} from '@/components/admin/admin-styles';
import { PRIMARY_BUTTON_CLASS } from '@/components/shared/button-styles';
import {
  type AdminPasswordState,
  changeAdminPassword,
} from '@/lib/actions/admin/auth';

type PasswordError = NonNullable<AdminPasswordState['error']>;

const ERROR_MESSAGES: Record<PasswordError, MessageDescriptor> = {
  too_short: msg`비밀번호는 12자 이상이어야 해요.`,
  same_as_login: msg`아이디와 다른 비밀번호를 써 주세요.`,
  mismatch: msg`비밀번호 확인이 일치하지 않아요.`,
  wrong_current: msg`현재 비밀번호가 맞지 않아요.`,
};

const INITIAL_STATE: AdminPasswordState = {};

interface PasswordFieldProps {
  name: string;
  label: React.ReactNode;
  autoComplete: 'current-password' | 'new-password';
  hint?: React.ReactNode;
}

const PasswordField = ({
  name,
  label,
  autoComplete,
  hint,
}: PasswordFieldProps) => {
  const inputId = useId();
  const hintId = useId();

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className={ADMIN_LABEL_CLASS}>
        {label}
      </label>
      <input
        id={inputId}
        name={name}
        type="password"
        autoComplete={autoComplete}
        required
        aria-describedby={hint ? hintId : undefined}
        className={ADMIN_INPUT_CLASS}
      />
      {hint && (
        <p id={hintId} className="text-[12px] leading-[1.6] text-ink-faint">
          {hint}
        </p>
      )}
    </div>
  );
};

interface PasswordFormProps {
  // 콘솔에서 바꿀 때만 현재 비밀번호를 받음 (임시 비밀번호 단계는 받지 않음)
  withCurrent: boolean;
}

/**
 * 어드민 비밀번호 변경 폼
 * - 규칙(12자 이상, 아이디와 다름)과 현재 비밀번호는 서버 액션이 확인
 * - 성공하면 서버 액션이 콘솔로 보냄
 */
const PasswordForm = ({ withCurrent }: PasswordFormProps) => {
  const { i18n } = useLingui();
  const [state, formAction, isPending] = useActionState(
    changeAdminPassword,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {withCurrent && (
        <PasswordField
          name="current"
          label={<Trans>현재 비밀번호</Trans>}
          autoComplete="current-password"
        />
      )}
      <PasswordField
        name="password"
        label={<Trans>새 비밀번호</Trans>}
        autoComplete="new-password"
        hint={<Trans>12자 이상, 아이디와 다르게 정해 주세요.</Trans>}
      />
      <PasswordField
        name="confirm"
        label={<Trans>새 비밀번호 확인</Trans>}
        autoComplete="new-password"
      />
      {state.error && (
        <p role="alert" className={ADMIN_ERROR_CLASS}>
          {i18n._(ERROR_MESSAGES[state.error])}
        </p>
      )}
      <button
        type="submit"
        disabled={isPending}
        aria-busy={isPending}
        className={PRIMARY_BUTTON_CLASS}
      >
        {isPending ? <Trans>바꾸는 중...</Trans> : <Trans>비밀번호 변경</Trans>}
      </button>
    </form>
  );
};

export default PasswordForm;
