import SignOutButton from '@/components/shared/sign-out-button';
import { requireSession } from '@/lib/auth/session';

export default async function DashboardPage() {
  // proxy 의 쿠키 존재 확인과 별개로, 페이지에서 DB 기준 세션 검증
  const { user } = await requireSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-bold">{user.name} 님, 환영합니다</h1>
      <p className="text-sm text-gray-600">{user.email}</p>
      <SignOutButton />
    </main>
  );
}
