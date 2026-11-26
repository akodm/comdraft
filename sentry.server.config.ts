import * as Sentry from '@sentry/nextjs';
import { getSentryOptions } from '@/lib/observability/sentry-options';

// Node.js 서버 (페이지 렌더링, Route Handler, Server Action)
Sentry.init(getSentryOptions());
