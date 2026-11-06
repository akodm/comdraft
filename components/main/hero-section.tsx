import { Trans } from '@lingui/react/macro';
import HeroPreview from '@/components/main/hero-preview';
import GithubSignInButton from '@/components/shared/github-sign-in-button';

// 메인 카피와 시작 버튼, 초안 작성 화면 예시
const HeroSection = () => {
  return (
    <section className="border-b border-line px-5 pt-12 pb-14 pc:py-25">
      <div className="flex flex-col gap-10 pc:mx-auto pc:max-w-7xl pc:flex-row pc:items-center pc:gap-20">
        <div className="flex flex-col gap-6 pc:w-150 pc:shrink-0 pc:gap-8">
          <div className="flex flex-col gap-5.5 pc:gap-7">
            <h1 className="text-[35px] leading-[1.35] font-bold tracking-[-1.8px] text-ink pc:text-[76px] pc:tracking-[-4px]">
              <Trans>
                작업 과정을{' '}
                <span className="block text-brand">글 초안으로.</span>
              </Trans>
            </h1>
            <p className="text-[14px] leading-[1.85] text-ink-muted pc:text-[18px]">
              <Trans>
                Github Commit 을 기술 블로그의 초안으로 활용하고,{' '}
                <br className="hidden pc:block" />
                다듬어 어디든 게시하세요.
              </Trans>
            </p>
          </div>
          {/* 바로 GitHub 로그인 시작 (최초 로그인이면 회원가입 후 온보딩, 아니면 대시보드로 이동) */}
          <GithubSignInButton className="pc:w-fit">
            <span className="text-[15px]">
              <Trans>GitHub로 시작하기</Trans>
            </span>
          </GithubSignInButton>
        </div>
        <HeroPreview />
      </div>
    </section>
  );
};

export default HeroSection;
