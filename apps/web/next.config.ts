import type { NextConfig } from 'next';
const config: NextConfig = {
  transpilePackages: ['@bingo/protocol'],
  async rewrites() {
    return [
      {
        source: '/api/v1/realtime',
        destination: `${process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000'}/v1/realtime`,
      },
    ];
  },
};
export default config;
