import type { NextConfig } from 'next';

// DESKTOP_EXPORT=1 : build statique embarqué par Tauri (apps/desktop). Les
// headers dynamiques n'existent pas en export — Tauri les pose lui-même
// (tauri.conf.json > app.security.headers).
const isDesktopExport = process.env['DESKTOP_EXPORT'] === '1';

const nextConfig: NextConfig = {
  // Les packages du workspace sont livrés en source TS.
  transpilePackages: [
    '@loqua/core',
    '@loqua/adapters-web',
    '@loqua/adapters-tauri',
    '@loqua/ui-web',
  ],
  ...(isDesktopExport
    ? { output: 'export' as const }
    : {
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
      }),
};

export default nextConfig;
