import { Trans } from '@lingui/react/macro';
import SampleCommitPanel from '@/components/main/sample-commit-panel';
import SampleDraftEditor from '@/components/main/sample-draft-editor';

// 초안 예시: 선택한 커밋(입력)과 만들어진 초안(출력)을 나란히 보여주는 샘플 작업 공간
const DraftExampleSection = () => {
  return (
    <section className="bg-surface px-5 py-14 pc:py-26">
      <div className="flex flex-col gap-7 pc:mx-auto pc:max-w-7xl pc:gap-10">
        <div className="flex flex-col gap-3.5 pc:gap-4.5">
          <h2 className="text-[26px] leading-[1.35] font-bold tracking-[-1px] text-ink pc:text-[40px] pc:tracking-[-1.6px]">
            <Trans>기술 개발 블로그 습관</Trans>
          </h2>
          <p className="text-[14px] leading-[1.75] text-ink-muted pc:text-[17px]">
            <Trans>
              간단하게 시작하고 초안을 만들어 꾸준히 글을 만들어보세요.
            </Trans>
          </p>
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-3 bg-brand-soft px-4 py-3 text-[11px] pc:px-6">
            <p className="leading-[1.2] font-bold whitespace-nowrap text-brand">
              <Trans>예시</Trans>
            </p>
            <p className="min-w-0 flex-1 leading-[1.7] text-ink-muted">
              <Trans>서비스 이해를 위한 샘플 저장소와 초안입니다.</Trans>
            </p>
          </div>
          <div className="flex flex-col border border-line pc:flex-row">
            <SampleCommitPanel />
            <SampleDraftEditor />
          </div>
        </div>
      </div>
    </section>
  );
};

export default DraftExampleSection;
