'use client';

import { useState } from 'react';
import { signIn } from '@/lib/auth/client';

interface GithubSignInButtonProps {
  callbackURL?: string;
}

const GithubSignInButton = ({
  callbackURL = '/dashboard',
}: GithubSignInButtonProps) => {
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSignIn = async () => {
    setIsPending(true);
    setErrorMessage(null);

    // GitHub 인증 페이지로 리다이렉트, 최초 로그인 시 자동으로 회원가입 처리
    const { error } = await signIn.social({
      provider: 'github',
      callbackURL,
      errorCallbackURL: '/sign-in',
    });

    if (error) {
      setErrorMessage(error.message ?? 'GitHub 로그인에 실패했습니다.');
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
        {isPending ? 'GitHub 로 이동 중...' : 'GitHub 로 시작하기'}
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
