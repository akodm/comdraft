import { Trans } from '@lingui/react/macro';
import CommitToDraftMotion from '@/components/auth/commit-to-draft-motion';

// 회원가입/로그인 화면 우측의 서비스 소개 (PC 레이아웃에서만 표시)
const AuthIntro = () => {
  return (
    <section className="hidden w-1/2 flex-col items-center justify-center border-l border-line bg-surface px-15 py-14 pc:flex">
      <div className="flex w-full max-w-170 flex-col gap-8">
        <div className="flex flex-col gap-5">
          <h2 className="text-[44px] leading-[1.35] font-bold tracking-[-2px] text-ink">
            <Trans>
              작업 과정을 <span className="block text-brand">글 초안으로.</span>
            </Trans>
          </h2>
          <p className="text-[17px] leading-[1.85] text-ink-muted">
            <Trans>
              작업 과정을 기술 블로그의 초안으로 활용하고, 어디든 게시하세요.
            </Trans>
          </p>
        </div>
        <CommitToDraftMotion />
      </div>
    </section>
  );
};

export default AuthIntro;
