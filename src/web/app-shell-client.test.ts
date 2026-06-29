import { beforeEach, describe, expect, test, vi } from 'vitest'
import { RENDERER_BRIDGE_VERSION } from '#/shared/bootstrap.ts'
import type { RendererBridge } from '#/web/renderer-bridge-types.ts'

function installWindow() {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: {
        href: 'http://127.0.0.1:32100/',
        origin: 'http://127.0.0.1:32100',
        search: '',
      },
      open: vi.fn(() => ({})),
    },
  })
}

function testBridge(overrides: Partial<RendererBridge> = {}): RendererBridge {
  const nativeShell = overrides.shell?.() ?? null
  return {
    kind: () => 'web',
    hasCapability: (capability) => {
      if (capability === 'settings-rpc') return typeof overrides.invokeRpc === 'function'
      if (capability === 'open-settings-window') return nativeShell?.openSettingsWindow !== undefined
      if (capability === 'open-external-url') return nativeShell?.openExternalUrl !== undefined
      if (capability === 'open-directory-dialog') return nativeShell?.openDirectoryDialog !== undefined
      if (capability === 'open-file-dialog') return nativeShell?.openFileDialog !== undefined
      if (capability === 'consume-external-open-paths') return nativeShell?.consumeExternalOpenPaths !== undefined
      if (capability === 'open-in-finder') return nativeShell?.openInFinder !== undefined
      if (capability === 'clipboard-file-paths') return nativeShell?.readClipboardFilePaths !== undefined
      if (capability === 'clipboard-binary-temp-files') return nativeShell?.saveClipboardBinaryFiles !== undefined
      if (capability === 'file-tree-clipboard') {
        return nativeShell?.writeFileTreeClipboardFile !== undefined && nativeShell?.readFileTreeClipboardFile !== undefined
      }
      return false
    },
    getBootstrap: () => ({
      runtime: { kind: 'web', bridgeVersion: RENDERER_BRIDGE_VERSION, capabilities: [] },
      homeDir: '/Users/test',
      initialI18n: null,
      initialSettings: null,
      initialServer: null,
    }),
    invokeRpc: vi.fn(),
    abortRpc: vi.fn(async () => false),
    onRpcEvent: () => () => {},
    onEffectIntent: () => () => {},
    pathForFile: () => '',
    shell: () => null,
    terminal: (() => {
      throw new Error('unused terminal bridge')
    }) as never,
    ...overrides,
  }
}

describe('app shell client', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
    installWindow()
  })

  test('opens app settings through the renderer bridge shell', async () => {
    const bridgeModule = await import('#/web/renderer-bridge.ts')
    const openSettingsWindow = vi.fn(async () => true)
    bridgeModule.setRendererBridgeForTests(
      testBridge({
        shell: () => ({
          openSettingsWindow,
          openExternalUrl: vi.fn(),
          openDirectoryDialog: vi.fn(),
          consumeExternalOpenPaths: vi.fn(),
          openInFinder: vi.fn(),
        }),
      }),
    )

    const { openAppSettings } = await import('#/web/app-shell-client.ts')
    await expect(openAppSettings('about')).resolves.toBe(true)
    expect(openSettingsWindow).toHaveBeenCalledWith({ page: 'about' })
  })

  test('opens external URLs in the browser when no native shell is available', async () => {
    const { openExternalUrl } = await import('#/web/app-shell-client.ts')
    await expect(openExternalUrl('https://example.com')).resolves.toEqual({ ok: true, message: 'https://example.com' })
    expect(window.open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
  })

  test('opens the project GitHub URL through the native shell with https-only policy', async () => {
    const bridgeModule = await import('#/web/renderer-bridge.ts')
    const shellOpenExternalUrl = vi.fn(async () => ({ ok: true, message: 'https://github.com/nano-props/goblin' }))
    bridgeModule.setRendererBridgeForTests(
      testBridge({
        shell: () => ({
          openSettingsWindow: vi.fn(),
          openExternalUrl: shellOpenExternalUrl,
          openDirectoryDialog: vi.fn(),
          consumeExternalOpenPaths: vi.fn(),
          openInFinder: vi.fn(),
        }),
      }),
    )

    const { openProjectGitHub } = await import('#/web/app-shell-client.ts')
    await expect(openProjectGitHub()).resolves.toEqual({ ok: true, message: 'https://github.com/nano-props/goblin' })
    expect(shellOpenExternalUrl).toHaveBeenCalledWith({
      url: 'https://github.com/nano-props/goblin',
      allowHttp: false,
    })
    expect(window.open).not.toHaveBeenCalled()
  })

  test('chooses repository paths through the renderer bridge shell', async () => {
    const bridgeModule = await import('#/web/renderer-bridge.ts')
    const openDirectoryDialog = vi.fn(async (input?: { title?: string }) =>
      input?.title === 'Open Git Repository' ? '/tmp/repo' : '/tmp',
    )
    bridgeModule.setRendererBridgeForTests(
      testBridge({
        shell: () => ({
          openSettingsWindow: vi.fn(),
          openExternalUrl: vi.fn(),
          openDirectoryDialog,
          consumeExternalOpenPaths: vi.fn(),
          openInFinder: vi.fn(),
        }),
      }),
    )

    const { chooseCloneParentPath, chooseLocalRepositoryPath, hasNativeDirectoryPicker } =
      await import('#/web/app-shell-client.ts')
    expect(hasNativeDirectoryPicker()).toBe(true)
    await expect(chooseLocalRepositoryPath()).resolves.toBe('/tmp/repo')
    await expect(chooseCloneParentPath()).resolves.toBe('/tmp')
  })

  test('chooses a file tree download directory through the renderer bridge shell', async () => {
    const bridgeModule = await import('#/web/renderer-bridge.ts')
    const openDirectoryDialog = vi.fn(async () => '/Downloads')
    bridgeModule.setRendererBridgeForTests(
      testBridge({
        shell: () => ({
          openSettingsWindow: vi.fn(),
          openExternalUrl: vi.fn(),
          openDirectoryDialog,
          consumeExternalOpenPaths: vi.fn(),
          openInFinder: vi.fn(),
        }),
      }),
    )

    const { chooseFileTreeDownloadDirectory } = await import('#/web/app-shell-client.ts')
    await expect(chooseFileTreeDownloadDirectory()).resolves.toBe('/Downloads')
    expect(openDirectoryDialog).toHaveBeenCalledWith({ title: 'Download files' })
  })

  test('chooses file tree upload files through the renderer bridge shell', async () => {
    const bridgeModule = await import('#/web/renderer-bridge.ts')
    const openFileDialog = vi.fn(async () => ['/Users/test/Desktop/a.txt', '/Users/test/Desktop/b.txt'])
    bridgeModule.setRendererBridgeForTests(
      testBridge({
        shell: () => ({
          openSettingsWindow: vi.fn(),
          openExternalUrl: vi.fn(),
          openDirectoryDialog: vi.fn(),
          openFileDialog,
          consumeExternalOpenPaths: vi.fn(),
          openInFinder: vi.fn(),
        }),
      }),
    )

    const { chooseFileTreeUploadFiles, hasNativeFilePicker } = await import('#/web/app-shell-client.ts')
    expect(hasNativeFilePicker()).toBe(true)
    await expect(chooseFileTreeUploadFiles()).resolves.toEqual([
      '/Users/test/Desktop/a.txt',
      '/Users/test/Desktop/b.txt',
    ])
    expect(openFileDialog).toHaveBeenCalledWith({ title: 'Upload files' })
  })

  test('returns an empty upload file list without a native shell', async () => {
    const { chooseFileTreeUploadFiles, hasNativeFilePicker } = await import('#/web/app-shell-client.ts')
    expect(hasNativeFilePicker()).toBe(false)
    await expect(chooseFileTreeUploadFiles()).resolves.toEqual([])
  })

  test('opens paths in Finder through the renderer bridge shell', async () => {
    const bridgeModule = await import('#/web/renderer-bridge.ts')
    const shellOpenInFinder = vi.fn(async () => ({ ok: true, message: '/tmp/repo/README.md' }))
    bridgeModule.setRendererBridgeForTests(
      testBridge({
        shell: () => ({
          openSettingsWindow: vi.fn(),
          openExternalUrl: vi.fn(),
          openDirectoryDialog: vi.fn(),
          consumeExternalOpenPaths: vi.fn(),
          openInFinder: shellOpenInFinder,
        }),
      }),
    )

    const { openInFinder } = await import('#/web/app-shell-client.ts')
    await expect(openInFinder('/tmp/repo/README.md')).resolves.toEqual({ ok: true, message: '/tmp/repo/README.md' })
    expect(shellOpenInFinder).toHaveBeenCalledWith({ path: '/tmp/repo/README.md' })
  })

  test('reads system clipboard file paths through the native shell', async () => {
    const bridgeModule = await import('#/web/renderer-bridge.ts')
    const readClipboardFilePaths = vi.fn(async () => ['/Users/test/report.pdf'])
    bridgeModule.setRendererBridgeForTests(
      testBridge({
        shell: () => ({
          openSettingsWindow: vi.fn(),
          openExternalUrl: vi.fn(),
          openDirectoryDialog: vi.fn(),
          consumeExternalOpenPaths: vi.fn(),
          openInFinder: vi.fn(),
          readClipboardFilePaths,
        }),
      }),
    )

    const { readSystemClipboardFilePaths } = await import('#/web/app-shell-client.ts')
    await expect(readSystemClipboardFilePaths()).resolves.toEqual(['/Users/test/report.pdf'])
  })

  test('returns an empty clipboard file path list without a native shell', async () => {
    const { readSystemClipboardFilePaths } = await import('#/web/app-shell-client.ts')
    await expect(readSystemClipboardFilePaths()).resolves.toEqual([])
  })

  test('saves clipboard binary files through the native shell', async () => {
    const bridgeModule = await import('#/web/renderer-bridge.ts')
    const saveClipboardBinaryFiles = vi.fn(async () => ({ ok: true as const, paths: ['/repo/tmp/pasted.png'] }))
    bridgeModule.setRendererBridgeForTests(
      testBridge({
        shell: () => ({
          openSettingsWindow: vi.fn(),
          openExternalUrl: vi.fn(),
          openDirectoryDialog: vi.fn(),
          consumeExternalOpenPaths: vi.fn(),
          openInFinder: vi.fn(),
          saveClipboardBinaryFiles,
        }),
      }),
    )

    const { saveClipboardBinaryFilesFromPaste } = await import('#/web/app-shell-client.ts')
    const input = {
      worktreePath: '/repo',
      temporaryFilesDirectory: '',
      files: [{ name: 'image.png', type: 'image/png', bytes: new ArrayBuffer(3) }],
    }
    await expect(saveClipboardBinaryFilesFromPaste(input)).resolves.toEqual({
      ok: true,
      paths: ['/repo/tmp/pasted.png'],
    })
    expect(saveClipboardBinaryFiles).toHaveBeenCalledWith(input)
  })

  test('returns an error for clipboard binary saves without a native shell', async () => {
    const { saveClipboardBinaryFilesFromPaste } = await import('#/web/app-shell-client.ts')
    await expect(
      saveClipboardBinaryFilesFromPaste({
        worktreePath: '/repo',
        temporaryFilesDirectory: '',
        files: [],
      }),
    ).resolves.toEqual({ ok: false, message: 'error.unsupported-native-bridge' })
  })

  test('writes and reads file tree clipboard files through the native shell', async () => {
    const bridgeModule = await import('#/web/renderer-bridge.ts')
    const writeFileTreeClipboardFile = vi.fn(async () => ({ ok: true as const }))
    const readFileTreeClipboardFile = vi.fn(async () => ({
      ok: true as const,
      file: { name: 'image.bin', byteLength: 3, bytesBase64: 'AQID' },
    }))
    bridgeModule.setRendererBridgeForTests(
      testBridge({
        shell: () => ({
          openSettingsWindow: vi.fn(),
          openExternalUrl: vi.fn(),
          openDirectoryDialog: vi.fn(),
          consumeExternalOpenPaths: vi.fn(),
          openInFinder: vi.fn(),
          writeFileTreeClipboardFile,
          readFileTreeClipboardFile,
        }),
      }),
    )

    const { readFileTreeClipboardFile: readFile, writeFileTreeClipboardFile: writeFile } =
      await import('#/web/app-shell-client.ts')
    const file = { name: 'image.bin', byteLength: 3, bytesBase64: 'AQID' }
    await expect(writeFile(file)).resolves.toEqual({ ok: true })
    await expect(readFile(30)).resolves.toEqual({ ok: true, file })
    expect(writeFileTreeClipboardFile).toHaveBeenCalledWith(file)
    expect(readFileTreeClipboardFile).toHaveBeenCalledWith({ maxBytes: 30 })
  })

  test('returns an error for file tree clipboard files without a native shell', async () => {
    const { readFileTreeClipboardFile, writeFileTreeClipboardFile } = await import('#/web/app-shell-client.ts')
    await expect(writeFileTreeClipboardFile({ name: 'image.bin', byteLength: 3, bytesBase64: 'AQID' })).resolves.toEqual({
      ok: false,
      message: 'error.unsupported-native-bridge',
    })
    await expect(readFileTreeClipboardFile(30)).resolves.toEqual({
      ok: false,
      message: 'error.unsupported-native-bridge',
    })
  })
})
