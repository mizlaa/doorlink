import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Unit tests for the demo's local store and simulated flows. Run with:
//   npx vitest run --config demo-app/vitest.config.mts
const root = path.resolve(import.meta.dirname, '..')

export default defineConfig({
  resolve: {
    alias: {
      '@demo': path.resolve(import.meta.dirname, 'src'),
      '@': path.resolve(root, 'src'),
      'server-only': path.resolve(root, 'test/server-only-stub.ts'),
    },
  },
  test: {
    root,
    environment: 'node',
    include: ['demo-app/tests/**/*.test.ts'],
    setupFiles: ['demo-app/tests/setup.ts'],
  },
})
