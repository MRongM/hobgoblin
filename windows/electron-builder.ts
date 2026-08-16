import { copyFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import type { AfterPackContext, Configuration } from 'electron-builder'

const ELECTRON_BUILDER_WINDOWS_ARCH = {
  x64: 1,
  arm64: 3,
} as const

async function restoreNodePtyConptyAssets(context: AfterPackContext): Promise<void> {
  if (context.electronPlatformName !== 'win32') return

  const arch =
    context.arch === ELECTRON_BUILDER_WINDOWS_ARCH.x64
      ? 'x64'
      : context.arch === ELECTRON_BUILDER_WINDOWS_ARCH.arm64
        ? 'arm64'
        : null
  if (!arch) throw new Error(`Unsupported Windows architecture for node-pty assets: ${context.arch}`)

  const nodePtyRoot = path.join(context.appOutDir, 'resources', 'app.asar.unpacked', 'node_modules', 'node-pty')
  const sourceDir = path.join(nodePtyRoot, 'prebuilds', `win32-${arch}`, 'conpty')
  const destinationDir = path.join(nodePtyRoot, 'build', 'Release', 'conpty')
  await mkdir(destinationDir, { recursive: true })
  await Promise.all(
    ['conpty.dll', 'OpenConsole.exe'].map((fileName) =>
      copyFile(path.join(sourceDir, fileName), path.join(destinationDir, fileName)),
    ),
  )
}

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
  asarUnpack: [
    'node_modules/node-pty/prebuilds/**/*',
    'node_modules/node-pty/build/Release/**/*',
    'node_modules/sharp/**/*',
    'node_modules/@img/**/*',
  ],
  afterPack: restoreNodePtyConptyAssets,
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
