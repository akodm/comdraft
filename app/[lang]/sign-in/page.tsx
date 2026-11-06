import Image from 'next/image';
import { msg } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import AuthIntro from '@/components/auth/auth-intro';
import PageLayout from '@/components/layout/page-layout';
import BrandLogo from '@/components/main/brand-logo';
import MainFooter from '@/components/main/main-footer';
import GithubSignInButton from '@/components/shared/github-sign-in-button';
import LocalizedLink from '@/components/shared/localized-link';
import { getSession } from '@/lib/auth/session';
import { localizedRedirect } from '@/lib/i18n/request';
import { initLingui } from '@/lib/i18n/server';

// Better Auth OAuth 콜백이 ?error= 로 넘겨주는 코드별 안내 문구
// 쿼리 값으로 조회하므로 프로토타입 키(constructor 등)에 걸리지 않도록 Map 사용
// 모듈 로드 시점에는 로케일을 알 수 없으므로 메시지 디스크립터(msg)로 두고 렌더링 시 번역
const ERROR_MESSAGES = new Map([
  [
    'email_not_found',
    msg`GitHub 이메일 정보를 받지 못했습니다. GitHub 앱의 이메일 접근 권한을 승인했는지 확인한 뒤 다시 시도해주세요.`,
  ],
  [
    'email_not_verified',
    msg`GitHub 에서 인증된 이메일을 확인할 수 없습니다. GitHub 기본 이메일의 인증 여부를 확인한 뒤 다시 시도해주세요.`,
  ],
  [
    'state_mismatch',
    msg`GitHub 인증 요청이 만료되었거나 유효하지 않습니다. 다시 시도해주세요.`,
  ],
]);

interface SignInPageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const i18n = await initLingui();
  const session = await getSession();
  const { error } = await searchParams;

  // 로그인 상태에서 GitHub 재인증에 실패한 경우에도 오류를 보여주도록 오류가 없을 때만 이동
  if (session && !error) {
    await localizedRedirect('/dashboard');
  }

  const errorMessage = error ? ERROR_MESSAGES.get(error) : undefined;

  return (
    <PageLayout className="flex" footer={<MainFooter width="wide" />}>
      <section className="relative flex min-h-140 w-full flex-col items-center justify-center px-5 pt-6 pb-22 pc:w-1/2 pc:px-0 pc:pb-0">
        {/* PC 에서는 안내 영역 왼쪽 끝에 아이콘을 맞춤 (영역 폭 400px, 버튼 안쪽 여백 4px) */}
        <LocalizedLink
          href="/"
          aria-label={i18n._(msg`홈으로 이동`)}
          className="absolute top-3.75 left-2.75 flex size-8 items-center justify-center pc:top-37.75 pc:left-[calc(50%-204px)]"
        >
          <Image
            src="/images/auth/home.svg"
            alt=""
            width={24}
            height={24}
            className="size-3.5 pc:size-6"
          />
        </LocalizedLink>
        <div className="flex w-full max-w-100 flex-col gap-8 pc:gap-12">
          <BrandLogo placement="auth" />
          <div className="flex flex-col gap-4">
            <h1 className="text-[26px] leading-[1.4] font-bold tracking-[-1px] text-ink pc:text-[36px] pc:tracking-[-1.4px]">
              <Trans>회원가입 / 로그인</Trans>
            </h1>
            <p className="text-[14px] leading-[1.85] text-ink-muted pc:text-[16px]">
              <Trans>Github 계정으로 시작하세요.</Trans>
            </p>
          </div>
          <div className="flex flex-col gap-5">
            {error && (
              <p role="alert" className="text-[13px] leading-[1.6] text-danger">
                {errorMessage ? (
                  i18n._(errorMessage)
                ) : (
                  <Trans>로그인 중 문제가 발생했습니다. ({error})</Trans>
                )}
              </p>
            )}
            <GithubSignInButton className="w-full">
              <Trans>Github 로 회원가입/로그인</Trans>
            </GithubSignInButton>
            {/* 약관 페이지가 아직 없어 텍스트로만 표시 */}
            <p className="text-[10px] leading-[1.6] text-ink-faint pc:text-[12px] pc:leading-[1.9]">
              <Trans>
                계속하시면{' '}
                <span className="text-ink-muted underline">이용약관</span> 및{' '}
                <span className="text-ink-muted underline">
                  개인정보처리방침
                </span>
                에 동의하게 됩니다.
              </Trans>
            </p>
            {session && (
              <LocalizedLink
                href="/dashboard"
                className="text-[13px] leading-[1.6] text-ink-muted underline"
              >
                <Trans>대시보드로 돌아가기</Trans>
              </LocalizedLink>
            )}
          </div>
        </div>
      </section>
      <AuthIntro />
    </PageLayout>
  );
}
