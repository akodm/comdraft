import type { BrowserOptions, NodeOptions } from '@sentry/nextjs';
import { scrubBreadcrumb, scrubEvent } from '@/lib/observability/scrub';

/**
 * SDK 가 스스로 모으는 데이터는 모두 끔 (기본값은 헤더·쿠키·본문·쿼리·지역 변수까지 수집)
 * - 지역 변수(stackFrameVariables)에는 커밋 코드, 초안 본문, 토큰이 들어 있을 수 있음
 * - 소스 문맥 줄(frameContextLines)은 우리 코드 줄이라 남김
 */
export const SENTRY_DATA_COLLECTION = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: false,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  mcp: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: false,
} satisfies NonNullable<NodeOptions['dataCollection']>;

/**
 * 브라우저·서버·엣지가 함께 쓰는 Sentry 설정
 * - DSN 이 없으면 꺼짐 (로컬 기본값, 미리보기 등)
 * - 오류만 수집: 성능 추적(tracesSampleRate 미설정), 세션 리플레이, 로그 전송은 쓰지 않음
 * - 보내기 전 이벤트를 한 번 더 정리 (scrub.ts)
 */
export const getSentryOptions = (): BrowserOptions & NodeOptions => {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

  return {
    dsn,
    enabled: Boolean(dsn),
    environment:
      process.env.NEXT_PUBLIC_VERCEL_ENV ??
      process.env.VERCEL_ENV ??
      process.env.NODE_ENV,
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,
    dataCollection: SENTRY_DATA_COLLECTION,
    maxBreadcrumbs: 30,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
};
