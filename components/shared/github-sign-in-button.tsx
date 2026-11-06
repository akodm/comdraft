'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import { Trans, useLingui } from '@lingui/react/macro';
import { useLocale } from '@/hooks/use-locale';
import { signIn } from '@/lib/auth/client';
import { localizePath } from '@/lib/i18n/config';

interface GithubSignInButtonProps {
  // 로케일 접두사 없는 경로 (현재 로케일을 붙여 이동)
  callbackURL?: string;
  // 버튼 문구 (생략하면 "GitHub 로 시작하기")
  children?: ReactNode;
  // 버튼과 오류 문구를 감싸는 영역 (폭 지정용), 지정하지 않으면 문구 길이만큼
  className?: string;
}

const GithubSignInButton = ({
  callbackURL = '/dashboard',
  children,
  className = '',
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
    <div className={`flex flex-col gap-2 ${className}`}>
      <button
        type="button"
        onClick={handleSignIn}
        disabled={isPending}
        className="flex h-13 w-full items-center justify-center gap-2.5 rounded border border-ink bg-ink px-5.5 disabled:opacity-50"
      >
        <Image
          src="/images/main/github-mark.svg"
          alt=""
          width={20}
          height={20}
        />
        <span className="text-[14px] leading-[1.2] font-bold whitespace-nowrap text-white pc:text-[15px]">
          {isPending ? (
            <Trans>GitHub 로 이동 중...</Trans>
          ) : (
            (children ?? <Trans>GitHub 로 시작하기</Trans>)
          )}
        </span>
      </button>
      {errorMessage && (
        <p role="alert" className="text-[12px] leading-[1.6] text-danger">
          {errorMessage}
        </p>
      )}
    </div>
  );
};

export default GithubSignInButton;
