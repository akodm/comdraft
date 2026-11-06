'use client';

import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useLocale } from '@/hooks/use-locale';
import { signIn } from '@/lib/auth/client';
import { localizePath } from '@/lib/i18n/config';

interface GithubSignInButtonProps {
  // 로케일 접두사 없는 경로 (현재 로케일을 붙여 이동)
  callbackURL?: string;
}

const GithubSignInButton = ({
  callbackURL = '/dashboard',
}: GithubSignInButtonProps) => {
  const { t } = useLingui();
  const locale = useLocale();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignIn = async () => {
    setIsPending(true);
    setErrorMessage(null);

    // GitHub 인증 페이지로 리다이렉트, 최초 로그인 시 자동으로 회원가입 처리 후 온보딩으로 이동
    // OAuth 콜백 주소(/api/auth/callback/github)는 그대로이고, 인증 후 돌아올 페이지만 현재 로케일로 지정
    const { error } = await signIn.social({
      provider: 'github',
      callbackURL: localizePath(locale, callbackURL),
      newUserCallbackURL: localizePath(locale, '/onboarding'),
      errorCallbackURL: localizePath(locale, '/sign-in'),
    });

    if (error) {
      setErrorMessage(error.message ?? t`GitHub 로그인에 실패했습니다.`);
      setIsPending(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={handleSignIn}
        disabled={isPending}
        className="rounded-md bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {isPending ? (
          <Trans>GitHub 로 이동 중...</Trans>
        ) : (
          <Trans>GitHub 로 시작하기</Trans>
        )}
      </button>
      {errorMessage && (
        <p role="alert" className="text-sm text-red-600">
          {errorMessage}
        </p>
      )}
    </div>
  );
};

export default GithubSignInButton;
