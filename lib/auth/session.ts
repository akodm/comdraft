import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import { deleteUserSessions } from '@/lib/auth/ban';
import { localizedRedirect } from '@/lib/i18n/request';

// 서버 컴포넌트/라우트에서 세션을 DB 기준으로 검증해 조회
// React cache 로 같은 요청 안에서는 layout/page 등 여러 곳에서 호출해도 DB 조회 1회로 공유
export const getSession = cache(async () => {
  return auth.api.getSession({
    headers: await headers(),
  });
});

type AppSession = NonNullable<Awaited<ReturnType<typeof getSession>>>;

// 이용 제한(밴)된 사용자의 세션이면 그 사용자의 세션을 모두 지우고 로그인 화면에서 안내
const rejectBannedSession = async (session: AppSession) => {
  if (!session.user.bannedAt) {
    return;
  }

  await deleteUserSessions(session.user.id);
  await localizedRedirect('/sign-in?error=banned');
};

// 인증 + 온보딩 완료가 필요한 페이지/액션에서 사용
// (세션이 없거나 밴이면 로그인 페이지, 온보딩 전이면 온보딩 페이지로 이동)
export const requireSession = async () => {
  const session = await getSession();

  if (!session) {
    return localizedRedirect('/sign-in');
  }

  await rejectBannedSession(session);

  if (!session.user.onboardedAt) {
    return localizedRedirect('/onboarding');
  }

  return session;
};

// 온보딩 페이지/액션 전용 (로그인만 확인, 밴이면 로그인 페이지, 이미 온보딩을 마쳤으면 대시보드로 이동)
export const requireOnboardingSession = async () => {
  const session = await getSession();

  if (!session) {
    return localizedRedirect('/sign-in');
  }

  await rejectBannedSession(session);

  if (session.user.onboardedAt) {
    return localizedRedirect('/dashboard');
  }

  return session;
};
