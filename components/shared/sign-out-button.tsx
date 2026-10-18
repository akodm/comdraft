'use client';

import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/auth/client';

const SignOutButton = () => {
  const router = useRouter();

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
      className="rounded-md border px-4 py-2"
    >
      로그아웃
    </button>
  );
};

export default SignOutButton;
