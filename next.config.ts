import type { NextConfig } from 'next';
import { linguiMacroSwcPlugin } from '@lingui/swc-plugin/options';

const nextConfig: NextConfig = {
  experimental: {
    // Lingui 매크로(Trans, msg, useLingui 등)를 빌드 시점에 변환
    swcPlugins: [linguiMacroSwcPlugin()],
  },
};

export default nextConfig;
