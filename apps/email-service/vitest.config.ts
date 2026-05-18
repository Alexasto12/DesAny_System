import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    alias: {
      '@desany/db': fileURLToPath(new URL('./src/__tests__/stubs/desany-db.ts', import.meta.url)),
    },
  },
});
