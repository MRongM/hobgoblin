import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { registerTrustedAppUrl, registerTrustedWebContents } from '#/main/ipc/trusted-webcontents.ts'
import { wireShellBridgeIpc } from '#/main/shell-bridge.ts'
import {
  SHELL_CONSUME_EXTERNAL_OPEN_PATHS_CHANNEL,
  SHELL_OPEN_DIRECTORY_DIALOG_CHANNEL,
  SHELL_OPEN_EXTERNAL_URL_CHANNEL,
  SHELL_OPEN_FILE_DIALOG_CHANNEL,
  SHELL_OPEN_SETTINGS_WINDOW_CHANNEL,
  SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL,
  SHELL_READ_FILE_TREE_CLIPBOARD_FILE_CHANNEL,
  SHELL_SAVE_CLIPBOARD_BINARY_FILES_CHANNEL,
  SHELL_WRITE_FILE_TREE_CLIPBOARD_FILE_CHANNEL,
} from '#/shared/ipc-channels.ts'

const {
  ipcHandlers,
  browserWindowFromWebContents,
  showOpenDialog,
  sendRendererEffectIntent,
  activateMainWindow,
  readClipboardFilePathsFromSystem,
  saveClipboardBinaryFilesToTemp,
  readFileTreeClipboardFile,
  writeFileTreeClipboardFile,
} = vi.hoisted(() => ({
  ipcHandlers: new Map<string, (_event: unknown, input: any) => unknown>(),
  browserWindowFromWebContents: vi.fn(),
  showOpenDialog: vi.fn(),
  sendRendererEffectIntent: vi.fn(),
  activateMainWindow: vi.fn(),
  readClipboardFilePathsFromSystem: vi.fn(),
  saveClipboardBinaryFilesToTemp: vi.fn(),
  readFileTreeClipboardFile: vi.fn(),
  writeFileTreeClipboardFile: vi.fn(),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (_event: unknown, input: any) => unknown) => {
      ipcHandlers.set(channel, handler)
    }),
  },
  BrowserWindow: { fromWebContents: browserWindowFromWebContents },
  dialog: { showOpenDialog },
  shell: { showItemInFolder: vi.fn() },
}))

vi.mock('#/main/window.ts', () => ({
  activateMainWindow,
  getMainWindow: vi.fn(() => null),
}))

vi.mock('#/main/renderer-surface-events.ts', () => ({
  sendRendererEffectIntent,
}))

vi.mock('#/main/clipboard-file-paths.ts', () => ({
  readClipboardFilePathsFromSystem,
}))

vi.mock('#/main/clipboard-binary-temp-files.ts', () => ({
  saveClipboardBinaryFilesToTemp,
}))

vi.mock('#/main/file-tree-clipboard.ts', () => ({
  readFileTreeClipboardFile,
  writeFileTreeClipboardFile,
}))

const trustedSender = { id: 1, once: vi.fn() }
const trustedEvent = {
  sender: trustedSender,
  senderFrame: { url: 'http://127.0.0.1:5173/' },
} as any

describe('shell bridge IPC', () => {
  beforeAll(() => {
    registerTrustedAppUrl('http://127.0.0.1:5173/')
    registerTrustedWebContents(trustedSender as any)
    wireShellBridgeIpc()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('wires shell bridge handlers', () => {
    expect(ipcHandlers.has(SHELL_OPEN_SETTINGS_WINDOW_CHANNEL)).toBe(true)
    expect(ipcHandlers.has(SHELL_OPEN_EXTERNAL_URL_CHANNEL)).toBe(true)
    expect(ipcHandlers.has(SHELL_OPEN_DIRECTORY_DIALOG_CHANNEL)).toBe(true)
    expect(ipcHandlers.has(SHELL_OPEN_FILE_DIALOG_CHANNEL)).toBe(true)
    expect(ipcHandlers.has(SHELL_CONSUME_EXTERNAL_OPEN_PATHS_CHANNEL)).toBe(true)
    expect(ipcHandlers.has(SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL)).toBe(true)
    expect(ipcHandlers.has(SHELL_WRITE_FILE_TREE_CLIPBOARD_FILE_CHANNEL)).toBe(true)
    expect(ipcHandlers.has(SHELL_READ_FILE_TREE_CLIPBOARD_FILE_CHANNEL)).toBe(true)
    expect(ipcHandlers.has(SHELL_SAVE_CLIPBOARD_BINARY_FILES_CHANNEL)).toBe(true)
  })

  test('parents directory dialogs to the sender window', async () => {
    const senderWindow = {} as any
    browserWindowFromWebContents.mockReturnValue(senderWindow)
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/repo'] })

    const result = await invoke(SHELL_OPEN_DIRECTORY_DIALOG_CHANNEL, { title: 'Open Git Repository' })

    expect(result).toBe('/repo')
    expect(browserWindowFromWebContents).toHaveBeenCalledWith(trustedSender)
    expect(showOpenDialog).toHaveBeenCalledWith(senderWindow, {
      properties: ['openDirectory'],
      title: 'Open Git Repository',
    })
  })

  test('parents file dialogs to the sender window', async () => {
    const senderWindow = {} as any
    browserWindowFromWebContents.mockReturnValue(senderWindow)
    showOpenDialog.mockResolvedValueOnce({ canceled: false, filePaths: ['/tmp/a.txt', '/tmp/b.txt'] })

    const result = await invoke(SHELL_OPEN_FILE_DIALOG_CHANNEL, { title: 'Upload files' })

    expect(result).toEqual(['/tmp/a.txt', '/tmp/b.txt'])
    expect(browserWindowFromWebContents).toHaveBeenCalledWith(trustedSender)
    expect(showOpenDialog).toHaveBeenCalledWith(senderWindow, {
      properties: ['openFile', 'multiSelections'],
      title: 'Upload files',
    })
  })

  test('returns an empty file list when the file dialog is canceled', async () => {
    browserWindowFromWebContents.mockReturnValue({} as any)
    showOpenDialog.mockResolvedValueOnce({ canceled: true, filePaths: ['/tmp/a.txt'] })

    const result = await invoke(SHELL_OPEN_FILE_DIALOG_CHANNEL, { title: 'Upload files' })

    expect(result).toEqual([])
  })

  test('returns no file paths for untrusted file dialog senders', async () => {
    const result = await invokeWithEvent(SHELL_OPEN_FILE_DIALOG_CHANNEL, { title: 'Upload files' }, {
      sender: { id: 99, once: vi.fn() },
      senderFrame: { url: 'https://example.com/' },
    } as any)

    expect(result).toEqual([])
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  test('opens settings through an effect intent on the activated main window', async () => {
    const mainWindow = {} as any
    activateMainWindow.mockResolvedValue(mainWindow)

    const result = await invoke(SHELL_OPEN_SETTINGS_WINDOW_CHANNEL, { page: 'about' })

    expect(result).toBe(true)
    expect(sendRendererEffectIntent).toHaveBeenCalledWith(mainWindow, {
      type: 'open-settings-requested',
      page: 'about',
    })
  })

  test('rejects untrusted shell bridge senders', async () => {
    const result = await invokeWithEvent(SHELL_OPEN_DIRECTORY_DIALOG_CHANNEL, { title: 'Open Git Repository' }, {
      sender: { id: 99, once: vi.fn() },
      senderFrame: { url: 'https://example.com/' },
    } as any)

    expect(result).toBeNull()
    expect(showOpenDialog).not.toHaveBeenCalled()
  })

  test('reads clipboard file paths for trusted senders', async () => {
    readClipboardFilePathsFromSystem.mockReturnValue(['/Users/test/report.pdf'])

    const result = await invoke(SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL)

    expect(result).toEqual(['/Users/test/report.pdf'])
    expect(readClipboardFilePathsFromSystem).toHaveBeenCalled()
  })

  test('returns no clipboard file paths for untrusted senders', async () => {
    readClipboardFilePathsFromSystem.mockReturnValue(['/Users/test/report.pdf'])

    const result = await invokeWithEvent(SHELL_READ_CLIPBOARD_FILE_PATHS_CHANNEL, undefined, {
      sender: { id: 99, once: vi.fn() },
      senderFrame: { url: 'https://example.com/' },
    } as any)

    expect(result).toEqual([])
  })

  test('saves clipboard binary files for trusted senders', async () => {
    saveClipboardBinaryFilesToTemp.mockResolvedValue({ ok: true, paths: ['/repo/tmp/pasted.png'] })

    const input = {
      worktreePath: '/repo',
      temporaryFilesDirectory: '',
      files: [{ name: 'image.png', type: 'image/png', bytes: new ArrayBuffer(3) }],
    }
    const result = await invoke(SHELL_SAVE_CLIPBOARD_BINARY_FILES_CHANNEL, input)

    expect(result).toEqual({ ok: true, paths: ['/repo/tmp/pasted.png'] })
    expect(saveClipboardBinaryFilesToTemp).toHaveBeenCalledWith(input)
  })

  test('writes and reads file tree clipboard files for trusted senders', async () => {
    writeFileTreeClipboardFile.mockResolvedValue({ ok: true })
    readFileTreeClipboardFile.mockResolvedValue({
      ok: true,
      file: { name: 'image.bin', byteLength: 3, bytesBase64: 'AQID' },
    })
    const input = { name: 'image.bin', byteLength: 3, bytesBase64: 'AQID' }

    await expect(invoke(SHELL_WRITE_FILE_TREE_CLIPBOARD_FILE_CHANNEL, input)).resolves.toEqual({ ok: true })
    await expect(
      invoke(SHELL_READ_FILE_TREE_CLIPBOARD_FILE_CHANNEL, { maxBytes: 30, targetName: 'README.md' }),
    ).resolves.toEqual({
      ok: true,
      file: input,
    })
    expect(writeFileTreeClipboardFile).toHaveBeenCalledWith(input)
    expect(readFileTreeClipboardFile).toHaveBeenCalledWith(30, 'README.md')
  })

  test('rejects clipboard binary saves for untrusted senders', async () => {
    const result = await invokeWithEvent(
      SHELL_SAVE_CLIPBOARD_BINARY_FILES_CHANNEL,
      {
        worktreePath: '/repo',
        temporaryFilesDirectory: '',
        files: [],
      },
      {
        sender: { id: 99, once: vi.fn() },
        senderFrame: { url: 'https://example.com/' },
      } as any,
    )

    expect(result).toEqual({ ok: false, message: 'error.invalid-path' })
    expect(saveClipboardBinaryFilesToTemp).not.toHaveBeenCalled()
  })
})

async function invoke<TInput>(channel: string, input?: TInput) {
  return await invokeWithEvent(channel, input, trustedEvent)
}

async function invokeWithEvent<TInput>(channel: string, input: TInput, event: unknown) {
  const handler = ipcHandlers.get(channel)
  if (!handler) throw new Error(`Missing IPC handler for ${channel}`)
  return await handler(event, input)
}
