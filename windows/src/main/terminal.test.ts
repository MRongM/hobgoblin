import { beforeAll, beforeEach, describe, expect, test, vi } from 'vitest'
import { wireTerminalIpc } from '#/main/terminal.ts'
import { registerTrustedAppUrl, registerTrustedWebContents } from '#/main/ipc/trusted-webcontents.ts'
import {
  TERMINAL_NOTIFY_BELL_CHANNEL,
  TERMINAL_SEND_TEST_NOTIFICATION_CHANNEL,
  TERMINAL_SET_BADGE_CHANNEL,
} from '#/shared/ipc-channels.ts'

const ipcHandlers = new Map<string, (_event: unknown, input: any) => unknown>()

// showNotificationWithResult() races 'show' vs 'failed' events rather than
// treating show() as a synchronous success. The mock must honour the same
// contract: register listeners via once(), then fire the right event inside
// show() so the promise resolves synchronously in tests.
//
// vi.hoisted() ensures this is evaluated before vi.mock() factory functions,
// which are hoisted to the top of the file by vitest's transformer.
const { mockNotificationEmitting } = vi.hoisted(() => ({
  mockNotificationEmitting(emitEvent: 'show' | 'failed' | 'click' | null) {
    return function MockNotification(this: {
      id: string
      show: ReturnType<typeof vi.fn>
      once: ReturnType<typeof vi.fn>
    }) {
      const listeners = new Map<string, () => void>()
      this.id = 'native-notification-id'
      this.once = vi.fn((event: string, cb: () => void) => {
        listeners.set(event, cb)
      })
      this.show = vi.fn(() => {
        if (emitEvent) listeners.get(emitEvent)?.()
      })
    }
  },
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (_event: unknown, input: any) => unknown) => {
      ipcHandlers.set(channel, handler)
    }),
    on: vi.fn((channel: string, handler: (_event: unknown, input: any) => unknown) => {
      ipcHandlers.set(channel, handler)
    }),
  },
  BrowserWindow: {
    getAllWindows: () => [],
    fromWebContents: vi.fn(() => ({ isDestroyed: () => false, isFocused: () => false, flashFrame: vi.fn() })),
  },
  Notification: Object.assign(vi.fn(mockNotificationEmitting('show')), {
    getHistory: vi.fn(async () => []),
    isSupported: vi.fn(() => true),
  }),
  app: { on: vi.fn(), getAppPath: vi.fn(() => '/app'), dock: { bounce: vi.fn(), setBadge: vi.fn() } },
}))

describe('terminal IPC', () => {
  beforeAll(() => {
    registerTrustedAppUrl('http://127.0.0.1:5173/')
    registerTrustedWebContents({ id: 1, once: vi.fn() } as any)
    wireTerminalIpc()
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  test('wires native terminal notification handlers', () => {
    expect(ipcHandlers.has(TERMINAL_NOTIFY_BELL_CHANNEL)).toBe(true)
    expect(ipcHandlers.has(TERMINAL_SEND_TEST_NOTIFICATION_CHANNEL)).toBe(true)
    expect(ipcHandlers.has(TERMINAL_SET_BADGE_CHANNEL)).toBe(true)
  })

  test('rejects terminal IPC calls from untrusted senders', async () => {
    const result = await invokeWithEvent(
      TERMINAL_NOTIFY_BELL_CHANNEL,
      {
        title: 'Terminal bell',
        body: 'zsh needs attention',
        repoRoot: '/tmp/repo',
      },
      {
        sender: { id: 99, once: vi.fn() },
        senderFrame: { url: 'https://example.com/' },
      },
    )

    expect(result).toBe(false)
  })

  test('rejects malformed bell payloads', async () => {
    await expect(invoke(TERMINAL_NOTIFY_BELL_CHANNEL, { title: 1, body: 'bad', repoRoot: '/tmp/repo' })).resolves.toBe(
      false,
    )
  })

  test('shows a system notification for trusted bell requests', async () => {
    const { BrowserWindow, Notification, app } = await import('electron')
    const flashFrame = vi.fn()
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce({
      isDestroyed: () => false,
      isFocused: () => false,
      flashFrame,
    } as any)

    await expect(
      invoke(TERMINAL_NOTIFY_BELL_CHANNEL, {
        title: 'Terminal bell',
        body: 'zsh needs attention in feature',
        repoRoot: '/tmp/repo',
      }),
    ).resolves.toBe(true)
    expect(flashFrame).toHaveBeenCalledWith(true)
    if (process.platform === 'darwin') {
      expect(app.dock?.bounce).toHaveBeenCalledWith('informational')
    } else {
      expect(app.dock?.bounce).not.toHaveBeenCalled()
    }
    expect(Notification).toHaveBeenCalledWith({
      title: 'Terminal bell',
      body: 'zsh needs attention in feature',
    })
  })

  test('returns false when the notification emits a failed event', async () => {
    const { BrowserWindow, Notification } = await import('electron')
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce({
      isDestroyed: () => false,
      isFocused: () => true,
      flashFrame: vi.fn(),
    } as any)
    vi.mocked(Notification).mockImplementationOnce(mockNotificationEmitting('failed') as any)

    await expect(
      invoke(TERMINAL_NOTIFY_BELL_CHANNEL, {
        title: 'Terminal bell',
        body: 'zsh needs attention',
        repoRoot: '/tmp/repo',
      }),
    ).resolves.toBe(false)
  })

  test('treats interaction with the native test notification as successful delivery', async () => {
    const { Notification } = await import('electron')
    vi.useFakeTimers()
    try {
      vi.mocked(Notification).mockImplementationOnce(mockNotificationEmitting('click') as any)

      const result = invoke(TERMINAL_SEND_TEST_NOTIFICATION_CHANNEL, undefined)
      await vi.advanceTimersByTimeAsync(5000)

      await expect(result).resolves.toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  test('does not treat a notification history entry as visible without a native presentation event', async () => {
    const { Notification } = await import('electron')
    vi.useFakeTimers()
    try {
      vi.mocked(Notification).mockImplementationOnce(mockNotificationEmitting(null) as any)
      vi.mocked(Notification.getHistory).mockResolvedValueOnce([{ id: 'native-notification-id' }] as any)

      const result = invoke(TERMINAL_SEND_TEST_NOTIFICATION_CHANNEL, undefined)
      await vi.advanceTimersByTimeAsync(5000)

      await expect(result).resolves.toBe(false)
      expect(Notification.getHistory).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  test('returns true when Notification.isSupported() is false (flashFrame/bounce already fired)', async () => {
    const { BrowserWindow, Notification } = await import('electron')
    const flashFrame = vi.fn()
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValueOnce({
      isDestroyed: () => false,
      isFocused: () => false,
      flashFrame,
    } as any)
    vi.mocked(Notification.isSupported).mockReturnValueOnce(false)

    await expect(
      invoke(TERMINAL_NOTIFY_BELL_CHANNEL, {
        title: 'Terminal bell',
        body: 'zsh needs attention',
        repoRoot: '/tmp/repo',
      }),
    ).resolves.toBe(true)
    expect(flashFrame).toHaveBeenCalledWith(true)
  })

  test('sends the dock badge count through the trusted ipc sender only', async () => {
    const { app } = await import('electron')
    invoke(TERMINAL_SET_BADGE_CHANNEL, 2)
    expect(app.dock?.bounce).not.toHaveBeenCalled()
    if (process.platform === 'darwin') {
      expect(app.dock?.setBadge).toHaveBeenCalledWith('2')
    } else {
      expect(app.dock?.setBadge).not.toHaveBeenCalled()
    }

    invokeWithEvent(TERMINAL_SET_BADGE_CHANNEL, 4, {
      sender: { id: 99, once: vi.fn() },
      senderFrame: { url: 'https://example.com/' },
    })
    expect(app.dock?.setBadge).toHaveBeenCalledTimes(process.platform === 'darwin' ? 1 : 0)
  })
})

function invoke<TInput>(channel: string, input: TInput): unknown {
  return invokeWithSender(channel, input, { id: 1, once: vi.fn(), isDestroyed: () => false })
}

function invokeWithSender<TInput>(
  channel: string,
  input: TInput,
  sender: { id: number; once: ReturnType<typeof vi.fn>; isDestroyed?: () => boolean },
): unknown {
  return invokeWithEvent(channel, input, {
    sender,
    senderFrame: { url: 'http://127.0.0.1:5173/?theme=light' },
  })
}

function invokeWithEvent<TInput>(channel: string, input: TInput, event: unknown): unknown {
  const handler = ipcHandlers.get(channel)
  if (!handler) throw new Error(`missing handler: ${channel}`)
  return handler(event, input)
}
