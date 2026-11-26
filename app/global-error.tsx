'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import '@/css/globals.css';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/**
 * 루트 레이아웃까지 실패했을 때의 마지막 안내 화면 (레이아웃·번역 없이 html 부터 직접 그림)
 * - 서버에서 난 오류(digest 있음)는 onRequestError 가 이미 보냈으므로 브라우저 오류만 보냄
 */
export default function GlobalError({ error, retry }: GlobalErrorProps) {
  useEffect(() => {
    if (!error.digest) {
      Sentry.captureException(error, { tags: { area: 'app.global-error' } });
    }
  }, [error]);

  return (
    <html lang="ko">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-white px-5 font-sans text-ink">
        <p role="alert" className="text-center text-sm break-keep text-danger">
          요청을 처리하지 못했습니다. 잠시 후 다시 시도해주세요.
          <br />
          Something went wrong. Please try again later.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-md border border-line px-4 py-2 text-ink transition-colors hover:border-ink-faint hover:bg-surface active:bg-disabled"
        >
          다시 시도 / Retry
        </button>
      </body>
    </html>
  );
}
