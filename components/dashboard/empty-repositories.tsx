import { Trans } from '@lingui/react/macro';
import AddRepositoryLink from '@/components/dashboard/add-repository-link';

// 연동한 저장소가 없을 때 (온보딩을 건너뛰었거나 모두 제거한 경우)
const EmptyRepositories = () => {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-5 pt-8 pb-12 pc:pt-12 pc:pb-20">
      <div className="flex w-full max-w-140 flex-col items-center gap-7">
        <div className="flex flex-col gap-2 text-center break-keep">
          <h1 className="text-[20px] leading-[1.5] font-bold text-ink pc:text-[22px]">
            <Trans>연동된 저장소가 없습니다.</Trans>
          </h1>
          <p className="text-[14px] leading-[1.7] text-ink-muted">
            <Trans>저장소를 추가하고 초안을 만들어보세요</Trans>
          </p>
        </div>
        <AddRepositoryLink variant="primary" />
      </div>
    </section>
  );
};

export default EmptyRepositories;
