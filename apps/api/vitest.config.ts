import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// NestJS 데코레이터 메타데이터를 읽으려면 SWC 변환이 필요합니다.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
  },
  plugins: [swc.vite()],
});
