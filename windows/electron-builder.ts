import type { Configuration } from 'electron-builder'

const config: Configuration = {
  appId: 'hobgoblin.app',
  productName: 'Hobgoblin',
  icon: 'assets/icon.icns',
  directories: {
    output: 'release',
  },
  files: [
    // Keep these runtime-loaded TS sources in the asar. Main resolves `#/*`
    // imports through Electron's native TS loader, so removing these globs
    // breaks packaged builds even though dev still works.
    'src/main/**/*.ts',
    'src/system/**/*.ts',
    'src/server/**/*.ts',
    'src/preload/**/*',
    'src/shared/**/*.ts',
    'dist/web/**/*',
    'package.json',
    'THIRD_PARTY_NOTICES.md',
    'LICENSES/**/*',
    '!src/**/*.test.ts',
    '!**/*.map',
  ],
  extraResources: [{ from: 'bin/hob.cmd', to: 'bin/hob.cmd' }],
  asarUnpack: ['node_modules/node-pty/prebuilds/**/*', 'node_modules/sharp/**/*', 'node_modules/@img/**/*'],
  win: {
    target: [{ target: 'nsis', arch: ['arm64', 'x64'] }],
    artifactName: '${productName}-${version}-${arch}.${ext}',
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    include: 'build/installer.nsh',
  },
}

export default config
