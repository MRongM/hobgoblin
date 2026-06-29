import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { activateMainWindow, getMainWindow } from '#/main/window.ts'
import { saveClipboardBinaryFilesToTemp } from '#/main/clipboard-binary-temp-files.ts'
import { readClipboardFilePathsFromSystem } from '#/main/clipboard-file-paths.ts'
import { readFileTreeClipboardFile, writeFileTreeClipboardFile } from '#/main/file-tree-clipboard.ts'
import { consumeExternalOpenPaths } from '#/main/external-open.ts'
import { focusedRegisteredSurface } from '#/main/window-registry.ts'
import { sendRendererEffectIntent } from '#/main/renderer-surface-events.ts'
import { isValidAbsolutePath } from '#/shared/input-validation.ts'
import { isTrustedIpcEvent } from '#/main/ipc/trusted-webcontents.ts'
import { openHttpExternal, openHttpsExternal } from '#/main/external-url.ts'
import type { SettingsPage } from '#/shared/rpc.ts'
import {
  SHELL_CONSUME_EXTERNAL_OPEN_PATHS_CHANNEL,
  SHELL_OPEN_DIRECTORY_DIALOG_CHANNEL,
  SHELL_OPEN_EXTERNAL_URL_CHANNEL,
  SHELL_OPEN_FILE_DIALOG_CHANNEL,
  SHELL_OPEN_IN_FINDER_CHANNEL,
  SHELL_OPEN_SETTINGS_WINDOW_CHANNEL,
  SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL,
  SHELL_READ_FILE_TREE_CLIPBOARD_FILE_CHANNEL,
  SHELL_SAVE_CLIPBOARD_BINARY_FILES_CHANNEL,
  SHELL_WRITE_FILE_TREE_CLIPBOARD_FILE_CHANNEL,
} from '#/shared/ipc-channels.ts'
import type {
  SaveClipboardBinaryFilesInput,
  SaveClipboardBinaryFilesResult,
} from '#/shared/clipboard-binary-temp-files.ts'
import type { FileTreeClipboardFilePayload } from '#/shared/file-tree-clipboard.ts'

function callerWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender) ?? focusedRegisteredSurface()?.window ?? getMainWindow() ?? null
}

export function wireShellBridgeIpc(): void {
  ipcMain.handle(SHELL_OPEN_SETTINGS_WINDOW_CHANNEL, async (event, input?: { page?: SettingsPage }) => {
    if (!isTrustedIpcEvent(event)) return false
    const win = await activateMainWindow()
    sendRendererEffectIntent(win, {
      type: 'open-settings-requested',
      page: input?.page ?? 'general',
    })
    return true
  })

  ipcMain.handle(
    SHELL_OPEN_EXTERNAL_URL_CHANNEL,
    async (event, input?: { url?: unknown; allowHttp?: unknown }): Promise<{ ok: boolean; message: string }> => {
      if (!isTrustedIpcEvent(event)) return { ok: false, message: 'error.invalid-url' }
      const url = typeof input?.url === 'string' ? input.url : ''
      const allowHttp = input?.allowHttp === true
      const ok = allowHttp ? await openHttpExternal(url) : await openHttpsExternal(url)
      return ok ? { ok: true, message: url } : { ok: false, message: 'error.invalid-url' }
    },
  )

  ipcMain.handle(
    SHELL_OPEN_DIRECTORY_DIALOG_CHANNEL,
    async (event, input?: { title?: unknown }): Promise<string | null> => {
      if (!isTrustedIpcEvent(event)) return null
      const title = typeof input?.title === 'string' && input.title.trim() ? input.title.trim() : 'Choose Folder'
      const win = callerWindow(event)
      const opts: Electron.OpenDialogOptions = { properties: ['openDirectory'], title }
      const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (result.canceled || result.filePaths.length === 0) return null
      return result.filePaths[0] ?? null
    },
  )

  ipcMain.handle(
    SHELL_OPEN_FILE_DIALOG_CHANNEL,
    async (event, input?: { title?: unknown }): Promise<string[]> => {
      if (!isTrustedIpcEvent(event)) return []
      const title = typeof input?.title === 'string' && input.title.trim() ? input.title.trim() : 'Choose Files'
      const win = callerWindow(event)
      const opts: Electron.OpenDialogOptions = { properties: ['openFile', 'multiSelections'], title }
      const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (result.canceled || result.filePaths.length === 0) return []
      return result.filePaths
    },
  )

  ipcMain.handle(
    SHELL_CONSUME_EXTERNAL_OPEN_PATHS_CHANNEL,
    async (event): Promise<string[]> => (isTrustedIpcEvent(event) ? consumeExternalOpenPaths() : []),
  )

  ipcMain.handle(
    SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL,
    async (event): Promise<string[]> => (isTrustedIpcEvent(event) ? readClipboardFilePathsFromSystem() : []),
  )

  ipcMain.handle(
    SHELL_SAVE_CLIPBOARD_BINARY_FILES_CHANNEL,
    async (event, input?: SaveClipboardBinaryFilesInput): Promise<SaveClipboardBinaryFilesResult> => {
      if (!isTrustedIpcEvent(event)) return { ok: false, message: 'error.invalid-path' }
      return await saveClipboardBinaryFilesToTemp(input as SaveClipboardBinaryFilesInput)
    },
  )

  ipcMain.handle(
    SHELL_WRITE_FILE_TREE_CLIPBOARD_FILE_CHANNEL,
    async (event, input?: FileTreeClipboardFilePayload) => {
      if (!isTrustedIpcEvent(event)) return { ok: false, message: 'error.invalid-path' }
      return await writeFileTreeClipboardFile(input as FileTreeClipboardFilePayload)
    },
  )

  ipcMain.handle(
    SHELL_READ_FILE_TREE_CLIPBOARD_FILE_CHANNEL,
    async (event, input?: { maxBytes?: unknown }) => {
      if (!isTrustedIpcEvent(event)) return { ok: false, message: 'error.invalid-path' }
      const maxBytes = typeof input?.maxBytes === 'number' ? input.maxBytes : 0
      return await readFileTreeClipboardFile(maxBytes)
    },
  )

  ipcMain.handle(
    SHELL_OPEN_IN_FINDER_CHANNEL,
    async (event, input?: { path?: unknown }): Promise<{ ok: boolean; message: string }> => {
      if (!isTrustedIpcEvent(event)) return { ok: false, message: 'error.invalid-path' }
      const path = input?.path
      if (!isValidAbsolutePath(path)) return { ok: false, message: 'error.invalid-path' }
      shell.showItemInFolder(path)
      return { ok: true, message: path }
    },
  )
}
