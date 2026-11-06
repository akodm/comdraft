import Image from 'next/image';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';

// 초안 생성 전 주의사항
const NOTICES = [
  msg`제 3자인 LLM API 에 코드가 보내집니다. 조직 및 비공개 저장소는 권하지 않습니다.`,
  msg`민감한 코드가 포함된 커밋을 보내지 않도록 하세요.`,
  msg`커밋 내 코드를 사이트 어디에도 저장하지 않습니다.`,
];

const NoticeSection = () => {
  const { i18n } = useLingui();

  return (
    <section className="px-5 py-14 pc:pt-24 pc:pb-26">
      <div className="flex flex-col gap-7 bg-white p-5 pc:mx-auto pc:max-w-7xl pc:flex-row pc:gap-16 pc:p-12">
        <div className="flex flex-col gap-4 pc:w-85 pc:shrink-0">
          <Image
            src="/images/main/triangle-alert.svg"
            alt=""
            width={28}
            height={28}
          />
          <h2 className="text-[25px] leading-normal font-bold tracking-[-1px] text-danger pc:text-[32px]">
            <Trans>꼭 확인하세요</Trans>
          </h2>
          <p className="text-[13px] leading-[1.8] text-ink">
            <Trans>초안을 만들기 전 반드시 확인해주세요.</Trans>
          </p>
        </div>
        <ol className="flex min-w-0 flex-col text-ink pc:flex-1">
          {NOTICES.map((notice, index) => (
            <li
              key={notice.id}
              className="flex gap-3 border-b border-line py-5 pc:gap-6 pc:py-5.5"
            >
              <span className="font-mono text-[12px] leading-[1.9] whitespace-nowrap">
                {String(index + 1).padStart(2, '0')}
              </span>
              <p className="min-w-0 flex-1 text-[14px] leading-[1.85] font-medium pc:text-[16px]">
                {i18n._(notice)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

export default NoticeSection;
