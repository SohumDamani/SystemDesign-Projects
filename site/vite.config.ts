import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base so the static build works on any host or sub-path.
  base: './',
  plugins: [react()],
  // The rate limiter lesson imports the real rate_limit.lua from the parent folder.
  server: { port: 5199, fs: { allow: ['..'] } },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/redis/**', 'node_modules/**'],
    setupFiles: ['tests/setup.ts'],
    environment: 'node',
    testTimeout: 60000,
  },
});
