import Image from 'next/image';
import { Trans } from '@lingui/react/macro';
import HeroPreview from '@/components/main/hero-preview';

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
          {/* 시작 동작(GitHub 로그인 연결)은 아직 정해지지 않아 디자인만 구현 */}
          <button
            type="button"
            className="flex h-13 w-full items-center justify-center gap-2.5 rounded border border-ink bg-ink px-5.5 pc:w-fit"
          >
            <Image
              src="/images/main/github-mark.svg"
              alt=""
              width={20}
              height={20}
            />
            <span className="text-[15px] leading-[1.2] font-bold whitespace-nowrap text-white">
              <Trans>GitHub로 시작하기</Trans>
            </span>
          </button>
        </div>
        <HeroPreview />
      </div>
    </section>
  );
};

export default HeroSection;
