import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';
import { linguiMacroSwcPlugin } from '@lingui/swc-plugin/options';

/**
 * 모든 경로에 붙이는 보안 응답 헤더
 * - 다른 사이트가 우리 화면을 iframe 으로 감싸지 못하게 막음 (X-Frame-Options + CSP frame-ancestors)
 * - CSP 는 지금은 frame-ancestors 만 둠 (전체 정책은 따로 도입)
 * - 어드민 레이아웃은 metadata 로 더 엄격한 referrer 를 따로 지정
 */
const SECURITY_HEADERS = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'none'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
];

const nextConfig: NextConfig = {
  experimental: {
    // Lingui 매크로(Trans, msg, useLingui 등)를 빌드 시점에 변환
    swcPlugins: [linguiMacroSwcPlugin()],
    // 어드민 권한 없음 처리에 forbidden() 사용
    authInterrupts: true,
  },
  images: {
    // 작성자 아바타 (GitHub 프로필 이미지)
    remotePatterns: [
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ],
  },
  headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

/**
 * Sentry 빌드 설정
 * - SENTRY_AUTH_TOKEN 이 있을 때만 소스맵을 올림 (없으면 업로드 없이 빌드, 스택은 번들 기준으로 보임)
 * - 올린 뒤 브라우저용 소스맵은 배포 결과에서 지움 (원본 코드를 공개하지 않음)
 */
export default withSentryConfig(nextConfig, {
  org: 'akodm',
  project: 'comdraft',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  telemetry: false,
  widenClientFileUpload: true,
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
    deleteSourcemapsAfterUpload: true,
  },
  // 화면 이동 추적을 쓰지 않으므로 경고를 끔
  suppressOnRouterTransitionStartWarning: true,
});
