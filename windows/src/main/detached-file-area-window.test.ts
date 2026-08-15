import { beforeEach, describe, expect, test, vi } from 'vitest'
import { SHELL_OPEN_DETACHED_FILE_AREA_WINDOW_CHANNEL } from '#/shared/ipc-channels.ts'
import type { DetachedFileAreaWindowRequest } from '#/shared/file-area.ts'

const mocks = vi.hoisted(() => {
  const state = {
    trusted: true,
    windowOptions: [] as any[],
    windows: [] as any[],
    ipcHandlers: new Map<string, (...args: any[]) => any>(),
    createRendererWindowWebPreferences: vi.fn(async () => ({ preload: '/app/preload.cjs' })),
    attachRendererSurfaceWindow: vi.fn(),
    detachRendererSurfaceWindow: vi.fn(),
    disposeRendererBootstrapForWebPreferences: vi.fn(),
    disposeNavigationCapability: vi.fn(),
    loadURL: vi.fn(async () => {}),
  }

  const BrowserWindow = vi.fn(function BrowserWindow(options: any) {
    const listeners = new Map<string, (...args: any[]) => void>()
    const onceListeners = new Map<string, (...args: any[]) => void>()
    const win = {
      webContents: {
        id: state.windows.length + 10,
        isDestroyed: () => false,
        on: vi.fn(),
        once: vi.fn(),
        setWindowOpenHandler: vi.fn(),
        session: { webRequest: { onBeforeSendHeaders: vi.fn() } },
      },
      isDestroyed: () => false,
      show: vi.fn(),
      close: vi.fn(() => listeners.get('closed')?.()),
      loadURL: state.loadURL,
      on: vi.fn((name: string, listener: (...args: any[]) => void) => listeners.set(name, listener)),
      once: vi.fn((name: string, listener: (...args: any[]) => void) => onceListeners.set(name, listener)),
      emit: (name: string) => (onceListeners.get(name) ?? listeners.get(name))?.(),
    }
    state.windowOptions.push(options)
    state.windows.push(win)
    return win
  })

  return { ...state, BrowserWindow }
})

vi.mock('electron', () => ({
  BrowserWindow: mocks.BrowserWindow,
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: any[]) => any) => mocks.ipcHandlers.set(channel, handler)),
  },
  screen: {
    getDisplayNearestPoint: () => ({ workArea: { x: 100, y: 50, width: 1440, height: 900 } }),
    getPrimaryDisplay: () => ({ workArea: { x: 100, y: 50, width: 1440, height: 900 } }),
  },
}))

vi.mock('#/main/ipc/trusted-webcontents.ts', () => ({
  isTrustedIpcEvent: () => mocks.trusted,
}))

vi.mock('#/main/window-shell.ts', () => ({
  allowRendererWindowEntryUrl: vi.fn(),
  configureEmbeddedServerNavigationCapability: () => mocks.disposeNavigationCapability,
  createRendererEntryUrl: () => ({ url: new URL('http://127.0.0.1:32200/detached/file-area') }),
  createRendererWindowWebPreferences: mocks.createRendererWindowWebPreferences,
  disposeRendererBootstrapForWebPreferences: mocks.disposeRendererBootstrapForWebPreferences,
  windowCanvasBackground: () => '#ffffff',
}))

vi.mock('#/main/renderer-surface.ts', () => ({
  attachRendererSurfaceWindow: mocks.attachRendererSurfaceWindow,
  detachRendererSurfaceWindow: mocks.detachRendererSurfaceWindow,
}))

vi.mock('#/main/theme.ts', () => ({
  getTheme: () => ({ resolved: 'light', colorTheme: 'github' }),
}))

vi.mock('#/main/window-chrome.ts', () => ({
  defaultTitleBarStyle: () => 'hidden',
  macTrafficLightPosition: () => undefined,
  titleBarOverlayForTheme: () => ({ color: '#ffffff', symbolColor: '#000000', height: 34 }),
}))

vi.mock('#/main/settings-server-client.ts', () => ({
  getSettingsPrefs: async () => ({ topbarHeightPx: 34 }),
}))

const request: DetachedFileAreaWindowRequest = {
  kind: 'git-worktree',
  repo: { kind: 'local', id: '/workspace/repo' },
  branch: 'feature/detached-window',
  tab: 'history',
  releasePoint: { x: 1500, y: 700 },
}

describe('detached file area window', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.trusted = true
    mocks.windowOptions.length = 0
    mocks.windows.length = 0
    mocks.ipcHandlers.clear()
    mocks.loadURL.mockResolvedValue(undefined)
    delete process.env.XDG_SESSION_TYPE
  })

  test('clamps a large detached window beside the release point', async () => {
    const { detachedFileAreaWindowBounds } = await import('#/main/detached-file-area-window.ts')

    expect(detachedFileAreaWindowBounds({ x: 100, y: 50, width: 1440, height: 900 }, { x: 1500, y: 700 })).toEqual({
      x: 580,
      y: 230,
      width: 960,
      height: 720,
    })
    expect(detachedFileAreaWindowBounds({ x: 0, y: 0, width: 700, height: 400 })).toEqual({
      x: 0,
      y: 0,
      width: 700,
      height: 400,
    })
  })

  test('rejects untrusted IPC without constructing a window', async () => {
    const { wireDetachedFileAreaWindowIpc } = await import('#/main/detached-file-area-window.ts')
    mocks.trusted = false
    wireDetachedFileAreaWindowIpc()

    const handler = mocks.ipcHandlers.get(SHELL_OPEN_DETACHED_FILE_AREA_WINDOW_CHANNEL)
    await expect(handler?.({ sender: { id: 1 } }, request)).resolves.toEqual({
      ok: false,
      message: 'error.unsupported-native-bridge',
    })
    expect(mocks.BrowserWindow).not.toHaveBeenCalled()
  })

  test('creates, registers, shows, and disposes a secure detached renderer window', async () => {
    const { wireDetachedFileAreaWindowIpc } = await import('#/main/detached-file-area-window.ts')
    wireDetachedFileAreaWindowIpc()

    const handler = mocks.ipcHandlers.get(SHELL_OPEN_DETACHED_FILE_AREA_WINDOW_CHANNEL)
    const result = await handler?.({ sender: { id: 1 } }, request)

    expect(result).toMatchObject({ ok: true })
    expect(mocks.createRendererWindowWebPreferences).toHaveBeenCalledWith({
      kind: 'detached-file-area',
      request,
    })
    expect(mocks.windowOptions[0]).toMatchObject({
      x: 580,
      y: 230,
      width: 960,
      height: 720,
      minWidth: 640,
      minHeight: 420,
      show: false,
      titleBarStyle: 'hidden',
      webPreferences: { preload: '/app/preload.cjs' },
    })
    expect(mocks.loadURL).toHaveBeenCalledWith('http://127.0.0.1:32200/detached/file-area')
    expect(mocks.attachRendererSurfaceWindow).toHaveBeenCalledWith(
      mocks.windows[0],
      expect.objectContaining({ logLabel: 'detached-file-area-window' }),
    )

    mocks.windows[0]?.emit('ready-to-show')
    expect(mocks.windows[0]?.show).toHaveBeenCalled()
    mocks.windows[0]?.emit('closed')
    expect(mocks.disposeNavigationCapability).toHaveBeenCalled()
    expect(mocks.disposeRendererBootstrapForWebPreferences).toHaveBeenCalled()
    expect(mocks.detachRendererSurfaceWindow).toHaveBeenCalled()
  })

  test('closes all remaining detached windows as one lifecycle operation', async () => {
    const { closeDetachedFileAreaWindows, wireDetachedFileAreaWindowIpc } =
      await import('#/main/detached-file-area-window.ts')
    wireDetachedFileAreaWindowIpc()
    const handler = mocks.ipcHandlers.get(SHELL_OPEN_DETACHED_FILE_AREA_WINDOW_CHANNEL)
    await handler?.({ sender: { id: 1 } }, request)
    await handler?.({ sender: { id: 1 } }, { ...request, tab: 'status' })

    closeDetachedFileAreaWindows()

    expect(mocks.windows[0]?.close).toHaveBeenCalled()
    expect(mocks.windows[1]?.close).toHaveBeenCalled()
  })
})
