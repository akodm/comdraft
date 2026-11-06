import Image from 'next/image';
import { Trans, useLingui } from '@lingui/react/macro';
import { SAMPLE_COMMITS } from '@/components/main/sample-commits';

// 초안 예시의 입력: 선택한 커밋 목록 (정적 일러스트)
const SampleCommitPanel = () => {
  const { i18n } = useLingui();
  const commitCount = SAMPLE_COMMITS.length;

  return (
    <div className="flex flex-col bg-code pc:w-96 pc:shrink-0">
      <div className="flex items-center justify-between border-b border-line-dark p-4 leading-[1.2] whitespace-nowrap pc:p-6">
        <p className="text-[14px] font-bold text-white">
          <Trans>선택한 커밋</Trans>
        </p>
        <p className="text-[12px] text-ink-subtle">
          <Trans>{commitCount}개 선택</Trans>
        </p>
      </div>
      <div className="flex flex-col gap-2.5 p-4 pc:p-6">
        <div className="flex items-center gap-2">
          <Image
            src="/images/main/github-16.svg"
            alt=""
            width={16}
            height={16}
          />
          <p className="font-mono text-[10px] leading-[normal] whitespace-nowrap text-white pc:text-[12px]">
            dev-note / image-lab
          </p>
        </div>
        <p className="text-[11px] leading-[1.2] whitespace-nowrap text-ink-subtle">
          <Trans>개인 공개 저장소 · main</Trans>
        </p>
      </div>
      <ul className="flex flex-col px-4 pc:px-6">
        {SAMPLE_COMMITS.map((commit) => (
          <li
            key={commit.hash}
            className="flex flex-col gap-2.5 border-t border-line-dark py-5.5"
          >
            <div className="flex items-center gap-2">
              <span className="flex size-4 items-center justify-center bg-brand">
                <Image
                  src="/images/main/check.svg"
                  alt=""
                  width={12}
                  height={12}
                />
              </span>
              <p className="font-mono text-[11px] leading-[normal] whitespace-nowrap text-ink-subtle">
                {commit.hash}
              </p>
            </div>
            <p className="text-[13px] leading-[1.65] font-medium text-white pc:text-[15px]">
              {i18n._(commit.message)}
            </p>
            <p className="font-mono text-[9px] leading-[1.7] text-ink-subtle pc:text-[11px]">
              {commit.file}
            </p>
            <p className="text-[12px] leading-[1.8] text-ink-subtle">
              {i18n._(commit.summary)}
            </p>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2.5 p-4 pc:p-6">
        <Image
          src="/images/main/arrow-down-white.svg"
          alt=""
          width={18}
          height={18}
          className="pc:hidden"
        />
        <Image
          src="/images/main/arrow-right-white.svg"
          alt=""
          width={18}
          height={18}
          className="hidden pc:block"
        />
        <p className="text-[12px] leading-[1.2] whitespace-nowrap text-white">
          <Trans>이 기록을 하나의 글로 정리</Trans>
        </p>
      </div>
    </div>
  );
};

export default SampleCommitPanel;
