'use client';

import { Trans } from '@lingui/react/macro';
import PageLayout from '@/components/layout/page-layout';

interface ErrorPageProps {
  retry: () => void;
}

// 페이지 렌더링과 Server Action 에서 처리되지 못한 오류의 공통 안내 화면
// ([lang]/layout 안쪽에서 렌더링되므로 LinguiClientProvider 의 번역을 그대로 사용)
const ErrorPage = ({ retry }: ErrorPageProps) => {
  return (
    <PageLayout className="flex flex-col items-center justify-center gap-6 px-5">
      <p role="alert" className="text-center text-sm break-keep text-red-600">
        <Trans>요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.</Trans>
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-md border px-4 py-2"
      >
        <Trans>다시 시도</Trans>
      </button>
    </PageLayout>
  );
};

export default ErrorPage;
