import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';
const nextConfig: NextConfig = {
  poweredByHeader: false,
  agentRules: false,
  reactStrictMode: true,
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ];
  },
};
export default createNextIntlPlugin('./src/i18n/request.ts')(nextConfig);
