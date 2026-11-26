import * as Sentry from '@sentry/nextjs';
import { getSentryOptions } from '@/lib/observability/sentry-options';

// 엣지 런타임 (proxy 등)
Sentry.init(getSentryOptions());
