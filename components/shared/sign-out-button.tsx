'use client';

import type { ReactNode } from 'react';
import { Trans } from '@lingui/react/macro';
import { useLocalizedRouter } from '@/hooks/use-localized-router';
import { signOut } from '@/lib/auth/client';

interface SignOutButtonProps {
  className?: string;
  // 문구 앞에 표시할 아이콘 (스튜디오 프로필 메뉴)
  icon?: ReactNode;
}

const SignOutButton = ({ className, icon }: SignOutButtonProps) => {
  const router = useLocalizedRouter();

  const handleSignOut = async () => {
    // 서버의 세션 행 삭제 + 세션 쿠키 제거
    await signOut({
      fetchOptions: {
        onSuccess: () => router.replace('/sign-in'),
      },
    });
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className={className ?? 'rounded-md border px-4 py-2'}
    >
      {icon}
      <Trans>로그아웃</Trans>
    </button>
  );
};

export default SignOutButton;
