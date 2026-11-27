import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const CORE = 'src/{engine,game,config}';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@/': fileURLToPath(new URL('./src/', import.meta.url)),
      '@tests/': fileURLToPath(new URL('./tests/', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        // engine·game·config: DOM 없는 node 환경
        extends: true,
        test: {
          name: 'core',
          environment: 'node',
          include: [`${CORE}/**/*.test.ts`],
          benchmark: { include: [`${CORE}/**/*.bench.ts`] },
        },
      },
      {
        // store·components·pages: jsdom
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: [`${CORE}/**`],
          setupFiles: ['./tests/setup.ts'],
          benchmark: { include: [] },
        },
      },
      {
        // scripts/: 수집기 (node). 커버리지 기준에는 넣지 않는다
        extends: true,
        test: {
          name: 'scripts',
          environment: 'node',
          include: ['scripts/**/*.test.ts'],
          benchmark: { include: [] },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**/*.ts', 'src/game/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.bench.ts'],
      // CLAUDE.md "테스트": 라인 90% [임시값]
      thresholds: { lines: 90 },
    },
  },
});
