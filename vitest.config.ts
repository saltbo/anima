import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    include: [
      'electron/**/__tests__/**/*.test.ts',
      'src/**/__tests__/**/*.test.{ts,tsx}',
    ],
    setupFiles: ['electron/main/__tests__/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
