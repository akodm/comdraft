'use client';

import { Trans } from '@lingui/react/macro';
import { useLocalizedRouter } from '@/hooks/use-localized-router';
import { signOut } from '@/lib/auth/client';

interface SignOutButtonProps {
  className?: string;
}

const SignOutButton = ({ className }: SignOutButtonProps) => {
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
      <Trans>로그아웃</Trans>
    </button>
  );
};

export default SignOutButton;
