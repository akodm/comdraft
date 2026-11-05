import { completeOnboarding } from '@/lib/actions/onboarding';
import SignOutButton from '@/components/shared/sign-out-button';
import SubmitButton from '@/components/shared/submit-button';
import { requireOnboardingSession } from '@/lib/auth/session';

// 온보딩 흐름 확인용 최소 화면 (실제 화면으로 교체 예정)
export default async function OnboardingPage() {
  const { user } = await requireOnboardingSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold">{user.name} 님, 환영합니다</h1>
      <form action={completeOnboarding}>
        <SubmitButton pendingText="처리 중...">시작하기</SubmitButton>
      </form>
      {/* 다른 GitHub 계정으로 가입하려는 경우의 탈출구 (온보딩 전에는 대시보드에 접근 불가) */}
      <SignOutButton />
    </main>
  );
}
