import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

// Reporting only, no thresholds: apps/web has near-zero test coverage on
// components today (AUDIT-CLEAN-CODE.md, finding M-web-6). Gating the build
// on a coverage number here would block every commit on pre-existing debt.
// Flip on `thresholds` once that debt is paid down.
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  esbuild: { jsx: 'automatic' },
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts', 'src/app/**'],
      reporter: ['text', 'html', 'lcov'],
    },
  },
});
