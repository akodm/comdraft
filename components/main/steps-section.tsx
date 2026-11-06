import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';

// 서비스 이용 단계 (렌더링 시 현재 로케일로 번역)
const STEPS = [
  {
    title: msg`Github 연결`,
    description: msg`Github 계정으로 로그인합니다`,
  },
  {
    title: msg`저장소/커밋 내역`,
    description: msg`저장소의 커밋 내역을 불러오고 선택합니다.`,
  },
  {
    title: msg`AI 초안 작성`,
    description: msg`커밋에 대한 설명을 프롬프트에 넣어 초안을 만듭니다.`,
  },
  {
    title: msg`검토 후 게시 및 내보내기`,
    description: msg`사이트 내 게시하거나 내보내어 다른 곳에서 활용하세요.`,
  },
];

// 동작 방식: 모바일은 세로, PC 는 가로로 단계를 잇는 연결선 표시
const StepsSection = () => {
  const { i18n } = useLingui();

  return (
    <section className="px-5 py-14 pc:py-24">
      <div className="flex flex-col gap-8 pc:mx-auto pc:max-w-7xl pc:gap-12">
        <h2 className="text-[26px] leading-[1.35] font-bold tracking-[-1px] text-ink pc:text-[40px] pc:tracking-[-1.6px]">
          <Trans>바로 시작해보세요.</Trans>
        </h2>
        <ol className="flex flex-col pc:flex-row pc:gap-8">
          {STEPS.map((step, index) => {
            const isLast = index === STEPS.length - 1;

            return (
              <li
                key={step.title.id}
                className="relative flex gap-4 pt-5 pb-7 pc:flex-1 pc:flex-col pc:gap-5.5 pc:pb-0"
              >
                {/* 다음 단계 번호까지 잇는 연결선 (모바일: 세로, PC: 가로) */}
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className="absolute top-15 -bottom-5 left-[19.25px] w-[1.5px] bg-connector pc:top-[39.25px] pc:bottom-auto pc:left-10 pc:h-[1.5px] pc:w-[calc(100%-8px)]"
                  />
                )}
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand font-mono text-[16px] leading-[normal] text-white">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5 pt-2.25 pc:pt-0">
                  <h3 className="text-[18px] leading-[1.2] font-bold tracking-[-0.6px] text-ink pc:text-[21px]">
                    {i18n._(step.title)}
                  </h3>
                  <p className="text-[14px] leading-[1.8] text-ink-muted">
                    {i18n._(step.description)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
};

export default StepsSection;
