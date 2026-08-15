import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '#': path.resolve(import.meta.dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'],
    // These imported tests validate root-only macOS/POSIX packaging, release
    // documentation, and brand-publication assets. Their assertions do not
    // apply to the independent Windows package; Windows build behavior is
    // covered by scripts/*.test.ts and Windows-specific source tests.
    exclude: [
      'src/main/desktop-identity.test.ts',
      'src/system/build-script.test.ts',
      'src/system/close-app.test.ts',
      'src/system/install-hob-cli.test.ts',
      'src/system/install-script.test.ts',
      'src/system/hob-cli.test.ts',
      'src/system/list-tmux-servers-script.test.ts',
      'src/system/release-documentation.test.ts',
      'src/web/brand-assets.test.ts',
    ],
    mockReset: true,
    restoreMocks: true,
  },
})
