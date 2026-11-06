import Image from 'next/image';
import { Trans } from '@lingui/react/macro';

// 예시 커밋에 추가된 코드 (코드라 번역하지 않음)
const ADDED_CODE = [
  '+ const observer =',
  '+   new IntersectionObserver(',
  '+     onIntersect',
  '+   );',
].join('\n');

// 히어로 우측의 초안 작성 화면 예시 (커밋 → 초안 변환을 보여주는 정적 일러스트)
const HeroPreview = () => {
  return (
    <figure className="flex w-full flex-col border border-line pc:w-150 pc:shrink-0">
      <div className="flex h-12 items-center justify-between bg-surface px-4 pc:px-6">
        <div className="flex items-center gap-2">
          <Image
            src="/images/main/file-pen-line.svg"
            alt=""
            width={16}
            height={16}
          />
          <p className="text-[12px] leading-[1.2] font-medium whitespace-nowrap text-ink">
            <Trans>새 초안</Trans>
          </p>
        </div>
        <figcaption className="text-[11px] leading-[1.2] whitespace-nowrap text-ink-muted">
          <Trans>작성 화면 예시</Trans>
        </figcaption>
      </div>
      <div className="flex flex-col gap-5 bg-code p-4 pc:p-7">
        <div className="flex items-center gap-2">
          <Image
            src="/images/main/github-17.svg"
            alt=""
            width={17}
            height={17}
          />
          <p className="font-mono text-[11px] leading-[normal] whitespace-nowrap text-white pc:text-[13px]">
            dev-note / image-lab
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <p className="font-mono text-[12px] leading-[normal] text-ink-subtle">
            a8f2c91
          </p>
          <p className="text-[13px] leading-[1.6] font-medium text-white pc:text-[17px]">
            <Trans>feat: 이미지 지연 로딩 적용</Trans>
          </p>
          <pre className="font-mono text-[11px] leading-[1.8] whitespace-pre-wrap text-white pc:text-[13px]">
            {ADDED_CODE}
          </pre>
        </div>
      </div>
      <div className="flex h-11 items-center gap-2.5 bg-brand-soft px-4 pc:px-7">
        <Image
          src="/images/main/arrow-down-brand.svg"
          alt=""
          width={16}
          height={16}
        />
        <p className="text-[12px] leading-[1.2] font-bold whitespace-nowrap text-brand">
          <Trans>커밋의 맥락을 글의 흐름으로</Trans>
        </p>
      </div>
      <div className="flex flex-col gap-3 bg-white p-4 pc:p-7">
        <p className="text-[17px] leading-[1.45] font-bold tracking-[-0.5px] text-ink pc:text-[24px]">
          <Trans>IntersectionObserver로 이미지 지연 로딩 구현하기</Trans>
        </p>
        <p className="text-[12px] leading-[1.8] text-ink-muted pc:text-[14px]">
          <Trans>
            화면에 보이는 이미지부터 불러오도록 로딩 방식을 바꿨습니다. 이번
            글에서는 구현 과정과 확인할 점을 정리합니다.
          </Trans>
        </p>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="size-1.25 bg-brand" />
          <p className="text-[11px] leading-[1.2] whitespace-nowrap text-brand">
            <Trans>AI 초안 · 게시 전 검토 필요</Trans>
          </p>
        </div>
      </div>
    </figure>
  );
};

export default HeroPreview;
