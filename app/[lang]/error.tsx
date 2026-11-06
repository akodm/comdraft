'use client';

import { Trans } from '@lingui/react/macro';

interface ErrorPageProps {
  retry: () => void;
}

// 페이지 렌더링과 Server Action 에서 처리되지 못한 오류의 공통 안내 화면
// ([lang]/layout 안쪽에서 렌더링되므로 LinguiClientProvider 의 번역을 그대로 사용)
const ErrorPage = ({ retry }: ErrorPageProps) => {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <p role="alert" className="text-sm text-red-600">
        <Trans>요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.</Trans>
      </p>
      <button
        type="button"
        onClick={() => retry()}
        className="rounded-md border px-4 py-2"
      >
        <Trans>다시 시도</Trans>
      </button>
    </main>
  );
};

export default ErrorPage;
