import type { NextConfig } from 'next';
import { linguiMacroSwcPlugin } from '@lingui/swc-plugin/options';

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
};

export default nextConfig;
