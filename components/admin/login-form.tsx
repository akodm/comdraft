'use client';

import { useActionState, useId, useState } from 'react';
import { msg } from '@lingui/core/macro';
import type { MessageDescriptor } from '@lingui/core';
import { Trans, useLingui } from '@lingui/react/macro';
import {
  ADMIN_ERROR_CLASS,
  ADMIN_INPUT_CLASS,
  ADMIN_LABEL_CLASS,
} from '@/components/admin/admin-styles';
import { PRIMARY_BUTTON_CLASS } from '@/components/shared/button-styles';
import { type AdminLoginState, loginAdmin } from '@/lib/actions/admin/auth';

type LoginError = NonNullable<AdminLoginState['error']>;

// 아이디·비밀번호 중 무엇이 틀렸는지는 알려 주지 않음 (잠금만 따로 안내)
const ERROR_MESSAGES: Record<LoginError, MessageDescriptor> = {
  invalid: msg`아이디 또는 비밀번호가 맞지 않아요.`,
  locked: msg`로그인을 여러 번 실패해 잠시 잠겼어요. 15분 뒤에 다시 시도해 주세요.`,
};

const INITIAL_STATE: AdminLoginState = {};

/**
 * 어드민 로그인 폼
 * - 성공하면 서버 액션이 콘솔 또는 비밀번호 변경 화면으로 보냄
 * - 실패하면 폼이 초기화되므로 아이디는 상태로 들고 있어 다시 입력하지 않게 함
 */
const LoginForm = () => {
  const { i18n } = useLingui();
  const loginIdId = useId();
  const passwordId = useId();
  const [loginId, setLoginId] = useState('');
  const [state, formAction, isPending] = useActionState(
    loginAdmin,
    INITIAL_STATE,
  );

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={loginIdId} className={ADMIN_LABEL_CLASS}>
          <Trans>아이디</Trans>
        </label>
        <input
          id={loginIdId}
          name="loginId"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          value={loginId}
          onChange={(event) => setLoginId(event.target.value)}
          className={ADMIN_INPUT_CLASS}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor={passwordId} className={ADMIN_LABEL_CLASS}>
          <Trans>비밀번호</Trans>
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className={ADMIN_INPUT_CLASS}
        />
      </div>
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
        {isPending ? <Trans>로그인 중...</Trans> : <Trans>로그인</Trans>}
      </button>
    </form>
  );
};

export default LoginForm;
