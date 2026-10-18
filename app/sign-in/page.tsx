import { redirect } from 'next/navigation';
import GithubSignInButton from '@/components/shared/github-sign-in-button';
import { getSession } from '@/lib/auth/session';

interface SignInPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await getSession();

  if (session) {
    redirect('/dashboard');
  }

  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold">comdraft</h1>
      <p className="text-sm text-gray-600">
        GitHub 계정으로 회원가입/로그인합니다. 저장소 권한은 가입 후 별도로
        연결합니다.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          로그인 중 문제가 발생했습니다. ({error})
        </p>
      )}
      <GithubSignInButton />
    </main>
  );
}
