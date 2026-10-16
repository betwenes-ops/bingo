import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['apps/api/test/*.integration.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 60000,
    hookTimeout: 120000,
    fileParallelism: false,
  },
});
