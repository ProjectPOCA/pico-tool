import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts']
  },
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@': resolve(__dirname, 'src/renderer/src'),
      // Main-process modules import electron at module scope; tests run in
      // plain node, so substitute a minimal stub.
      electron: resolve(__dirname, 'tests/stubs/electron.ts')
    }
  }
})
