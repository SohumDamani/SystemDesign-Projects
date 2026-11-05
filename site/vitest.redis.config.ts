import { defineConfig } from 'vitest/config';

// Runs only the conformance test that needs a real Redis on port 6390.
export default defineConfig({
  server: { fs: { allow: ['..'] } },
  test: { include: ['tests/redis/**/*.test.ts'], setupFiles: ['tests/setup.ts'], environment: 'node', testTimeout: 120000 },
});
