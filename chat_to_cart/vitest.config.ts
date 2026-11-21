import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.{test,spec}.{ts,tsx,mjs}', '**/__tests__/**/*.{test,spec}.{ts,tsx,mjs}'],
    setupFiles: ['./tests/setup.ts'],
    env: {
      NODE_ENV: 'test',
    },
  },
});
