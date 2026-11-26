import * as Sentry from '@sentry/nextjs';
import { getSentryOptions } from '@/lib/observability/sentry-options';

// 브라우저: 처리되지 않은 오류와 reportError 로 보낸 오류만 수집 (화면 이동 추적은 하지 않음)
Sentry.init(getSentryOptions());
