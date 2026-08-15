import { BrowserWindow, ipcMain, screen, type Rectangle } from 'electron'
import { randomUUID } from 'node:crypto'
import {
  normalizeDetachedFileAreaWindowRequest,
  type DetachedFileAreaReleasePoint,
  type DetachedFileAreaWindowRequest,
  type OpenDetachedFileAreaWindowResult,
} from '#/shared/file-area.ts'
import { SHELL_OPEN_DETACHED_FILE_AREA_WINDOW_CHANNEL } from '#/shared/ipc-channels.ts'
import { isTrustedIpcEvent } from '#/main/ipc/trusted-webcontents.ts'
import {
  allowRendererWindowEntryUrl,
  configureEmbeddedServerNavigationCapability,
  createRendererEntryUrl,
  createRendererWindowWebPreferences,
  disposeRendererBootstrapForWebPreferences,
  windowCanvasBackground,
} from '#/main/window-shell.ts'
import { attachRendererSurfaceWindow, detachRendererSurfaceWindow } from '#/main/renderer-surface.ts'
import { defaultTitleBarStyle, macTrafficLightPosition, titleBarOverlayForTheme } from '#/main/window-chrome.ts'
import { getTheme } from '#/main/theme.ts'
import { getSettingsPrefs } from '#/main/settings-server-client.ts'

const DEFAULT_WIDTH = 960
const DEFAULT_HEIGHT = 720
const MIN_WIDTH = 640
const MIN_HEIGHT = 420

const detachedWindows = new Map<string, BrowserWindow>()
let ipcWired = false

export function detachedFileAreaWindowBounds(
  workArea: Rectangle,
  releasePoint?: DetachedFileAreaReleasePoint,
): Rectangle {
  const width = Math.min(DEFAULT_WIDTH, workArea.width)
  const height = Math.min(DEFAULT_HEIGHT, workArea.height)
  const requestedX = releasePoint ? releasePoint.x - 80 : workArea.x + Math.round((workArea.width - width) / 2)
  const requestedY = releasePoint ? releasePoint.y - 18 : workArea.y + Math.round((workArea.height - height) / 2)
  return {
    x: Math.min(Math.max(requestedX, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(requestedY, workArea.y), workArea.y + workArea.height - height),
    width,
    height,
  }
}

export function wireDetachedFileAreaWindowIpc(): void {
  if (ipcWired) return
  ipcWired = true
  ipcMain.handle(
    SHELL_OPEN_DETACHED_FILE_AREA_WINDOW_CHANNEL,
    async (event, input: unknown): Promise<OpenDetachedFileAreaWindowResult> => {
      if (!isTrustedIpcEvent(event)) return unsupportedResult()
      const request = normalizeDetachedFileAreaWindowRequest(input)
      if (!request) return { ok: false, message: 'error.invalid-input' }
      return await openDetachedFileAreaWindow(request)
    },
  )
}

export function closeDetachedFileAreaWindows(): void {
  for (const win of [...detachedWindows.values()]) {
    if (!win.isDestroyed()) win.close()
  }
}

async function openDetachedFileAreaWindow(
  request: DetachedFileAreaWindowRequest,
): Promise<OpenDetachedFileAreaWindowResult> {
  const windowKey = `detached-file-area:${randomUUID()}`
  const surface = { kind: 'detached-file-area' as const, request }
  const webPreferences = await createRendererWindowWebPreferences(surface)
  const settings = await getSettingsPrefs()
  const theme = getTheme()
  const display = request.releasePoint
    ? screen.getDisplayNearestPoint(request.releasePoint)
    : screen.getPrimaryDisplay()
  const bounds = detachedFileAreaWindowBounds(display.workArea, request.releasePoint)
  const canPosition = process.env.XDG_SESSION_TYPE?.toLowerCase() !== 'wayland'
  const surfaceSpec = {
    windowKey,
    capabilities: { rpcBroadcast: true, themeSync: true },
  } as const
  const win = new BrowserWindow({
    ...(canPosition ? { x: bounds.x, y: bounds.y } : {}),
    width: bounds.width,
    height: bounds.height,
    minWidth: Math.min(MIN_WIDTH, bounds.width),
    minHeight: Math.min(MIN_HEIGHT, bounds.height),
    show: false,
    title: 'Hobgoblin',
    backgroundColor: windowCanvasBackground(),
    titleBarStyle: defaultTitleBarStyle(),
    titleBarOverlay: titleBarOverlayForTheme(theme.resolved, theme.colorTheme, settings.topbarHeightPx),
    trafficLightPosition: macTrafficLightPosition(settings.topbarHeightPx),
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences,
  })
  attachRendererSurfaceWindow(win, { logLabel: 'detached-file-area-window', surface: surfaceSpec })
  const disposeNavigationCapability = configureEmbeddedServerNavigationCapability(win)
  const { url } = createRendererEntryUrl({ routePath: '/detached/file-area' })
  allowRendererWindowEntryUrl(win, url.toString())
  detachedWindows.set(windowKey, win)

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show()
  })
  win.on('closed', () => {
    detachedWindows.delete(windowKey)
    disposeNavigationCapability()
    disposeRendererBootstrapForWebPreferences(webPreferences)
    detachRendererSurfaceWindow(win, surfaceSpec)
  })

  try {
    await win.loadURL(url.toString())
    return { ok: true, windowKey }
  } catch (error) {
    console.warn('[detached-file-area-window] failed to load renderer', error)
    if (!win.isDestroyed()) win.close()
    return { ok: false, message: 'error.failed-open-window' }
  }
}

function unsupportedResult(): OpenDetachedFileAreaWindowResult {
  return { ok: false, message: 'error.unsupported-native-bridge' }
}
