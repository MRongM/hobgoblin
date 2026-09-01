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
  extraResources: [
    { from: 'bin/hob', to: 'bin/hob' },
    { from: 'bin/hob.cmd', to: 'bin/hob.cmd' },
  ],
  asarUnpack: [
    'node_modules/node-pty/prebuilds/**/*',
    'node_modules/node-pty/build/Release/**/*',
    'node_modules/sharp/**/*',
    'node_modules/@img/**/*',
  ],
  afterPack: restoreNodePtyConptyAssets,
  mac: {
    category: 'public.app-category.developer-tools',
    extendInfo: {
      // Required for macOS to show Hobgoblin in System Settings → Notifications
      // and to allow Banner/Alert style notifications. Without this key the
      // app either won't appear in the notification list at all, or will be
      // locked to the silent "None" style with no user-visible controls.
      NSUserNotificationAlertStyle: 'alert',
      CFBundleDocumentTypes: [
        {
          CFBundleTypeName: 'Folder',
          CFBundleTypeRole: 'Viewer',
          LSHandlerRank: 'Alternate',
          LSItemContentTypes: ['public.folder'],
        },
      ],
    },
    // electron-builder organizes builds by arch, so any `dir` here would be
    // emitted for every arch declared on dmg. `build.ts install` picks the
    // host-arch directory out of `release/mac*/` itself.
    target: [
      { target: 'dmg', arch: ['arm64', 'x64'] },
      { target: 'dir', arch: ['arm64', 'x64'] },
    ],
    identity: null,
    // Force arch into the filename. electron-builder's default omits the
    // suffix on x64, which would make `Hobgoblin-0.1.0.dmg` (intel) and
    // `Hobgoblin-0.1.0-arm64.dmg` (apple silicon) sort next to each other in
    // releases with no hint of which is which.
    artifactName: '${productName}-${version}-${arch}.${ext}',
  },
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
