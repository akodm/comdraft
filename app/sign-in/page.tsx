import { redirect } from 'next/navigation';
import GithubSignInButton from '@/components/shared/github-sign-in-button';
import { getSession } from '@/lib/auth/session';

// Better Auth OAuth 콜백이 ?error= 로 넘겨주는 코드별 안내 문구
const ERROR_MESSAGES: Record<string, string> = {
  email_not_found:
    'GitHub 이메일 정보를 받지 못했습니다. 이메일 제공에 동의한 뒤 다시 시도해주세요.',
  email_not_verified:
    'GitHub 에서 인증된 이메일을 확인할 수 없습니다. 이메일 제공에 동의한 뒤 다시 시도해주세요.',
};

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
          {ERROR_MESSAGES[error] ?? `로그인 중 문제가 발생했습니다. (${error})`}
        </p>
      )}
      <GithubSignInButton />
    </main>
  );
}
