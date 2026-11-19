import { describe, expect, it } from 'vitest';
import nextConfig from '@/next.config';

describe('보안 응답 헤더', () => {
  it('모든 경로(/:path*)에 보안 헤더를 붙임', async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const all = rules.find((rule) => rule.source === '/:path*');

    expect(all).toBeDefined();
    expect(
      Object.fromEntries(all!.headers.map(({ key, value }) => [key, value])),
    ).toEqual({
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy':
        'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    });
  });

  it('기존 설정(Lingui 플러그인, authInterrupts, 이미지 도메인)은 그대로', () => {
    expect(nextConfig.experimental?.swcPlugins).toHaveLength(1);
    expect(nextConfig.experimental?.authInterrupts).toBe(true);
    expect(nextConfig.images?.remotePatterns).toEqual([
      { protocol: 'https', hostname: 'avatars.githubusercontent.com' },
    ]);
  });
});
