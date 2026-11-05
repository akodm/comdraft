import Link from 'next/link';
import { redirect } from 'next/navigation';
import GithubSignInButton from '@/components/shared/github-sign-in-button';
import { getSession } from '@/lib/auth/session';

// Better Auth OAuth 콜백이 ?error= 로 넘겨주는 코드별 안내 문구
// 쿼리 값으로 조회하므로 프로토타입 키(constructor 등)에 걸리지 않도록 Map 사용
const ERROR_MESSAGES = new Map([
  [
    'email_not_found',
    'GitHub 이메일 정보를 받지 못했습니다. GitHub 앱의 이메일 접근 권한을 승인했는지 확인한 뒤 다시 시도해주세요.',
  ],
  [
    'email_not_verified',
    'GitHub 에서 인증된 이메일을 확인할 수 없습니다. GitHub 기본 이메일의 인증 여부를 확인한 뒤 다시 시도해주세요.',
  ],
  [
    'state_mismatch',
    'GitHub 인증 요청이 만료되었거나 유효하지 않습니다. 다시 시도해주세요.',
  ],
]);

interface SignInPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await getSession();
  const { error } = await searchParams;

  // 로그인 상태에서 GitHub 재인증에 실패한 경우에도 오류를 보여주도록 오류가 없을 때만 이동
  if (session && !error) {
    redirect('/dashboard');
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-2xl font-bold">comdraft</h1>
      <p className="text-sm text-gray-600">
        GitHub 계정으로 회원가입/로그인합니다. 저장소 권한은 가입 후 별도로
        연결합니다.
      </p>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {ERROR_MESSAGES.get(error) ??
            `로그인 중 문제가 발생했습니다. (${error})`}
        </p>
      )}
      <GithubSignInButton />
      {session && (
        <Link href="/dashboard" className="text-sm text-gray-600">
          대시보드로 돌아가기
        </Link>
      )}
    </main>
  );
}
