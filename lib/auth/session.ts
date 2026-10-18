import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

// 서버 컴포넌트/라우트에서 세션을 DB 기준으로 검증해 조회
export const getSession = async () => {
  return auth.api.getSession({
    headers: await headers(),
  });
};

// 인증이 필요한 페이지에서 사용 (세션이 없으면 로그인 페이지로 이동)
export const requireSession = async () => {
  const session = await getSession();

  if (!session) {
    redirect('/sign-in');
  }

  return session;
};
