import * as Sentry from '@sentry/nextjs';

// 서버 인스턴스가 뜰 때 런타임에 맞는 Sentry 설정을 불러옴
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// 페이지 렌더링, Route Handler, Server Action, proxy 에서 처리되지 않은 오류를 Sentry 로
export const onRequestError = Sentry.captureRequestError;
