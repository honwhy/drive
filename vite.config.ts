import { defineConfig } from 'vitest/config';

// 纯静态产物，部署到 Workers Static Assets；不引入任何运行时依赖。
export default defineConfig({
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    assetsInlineLimit: 4096,
  },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
