import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';

// 서버 컴포넌트/라우트에서 세션을 DB 기준으로 검증해 조회
// React cache 로 같은 요청 안에서는 layout/page 등 여러 곳에서 호출해도 DB 조회 1회로 공유
export const getSession = cache(async () => {
  return auth.api.getSession({
    headers: await headers(),
  });
});

// 인증 + 온보딩 완료가 필요한 페이지/액션에서 사용
// (세션이 없으면 로그인 페이지, 온보딩 전이면 온보딩 페이지로 이동)
export const requireSession = async () => {
  const session = await getSession();

  if (!session) {
    redirect('/sign-in');
  }

  if (!session.user.onboardedAt) {
    redirect('/onboarding');
  }

  return session;
};

// 온보딩 페이지/액션 전용 (로그인만 확인, 이미 온보딩을 마쳤으면 대시보드로 이동)
export const requireOnboardingSession = async () => {
  const session = await getSession();

  if (!session) {
    redirect('/sign-in');
  }

  if (session.user.onboardedAt) {
    redirect('/dashboard');
  }

  return session;
};
