import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Les packages du workspace sont livrés en source TS.
  transpilePackages: ['@loqua/core', '@loqua/adapters-web', '@loqua/ui-web'],
  // COOP/COEP requis pour SQLite-WASM/OPFS et WebGPU (acquis Spike #1).
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' },
        ],
      },
    ];
  },
};

export default nextConfig;
