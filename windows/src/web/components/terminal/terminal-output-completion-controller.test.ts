import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { TerminalOutputCompletionIntent } from '#/web/components/terminal/types.ts'

const mocks = vi.hoisted(() => ({
  getFetchSettings: vi.fn(),
  getTelegramSettings: vi.fn(),
  send: vi.fn(async (_context: unknown) => ({ ok: true as const })),
  context: vi.fn(() => ({
    terminalKey: 'terminal-key',
    project: 'api',
    contextKind: 'directory' as const,
    context: 'api',
    directory: '/repo',
    terminalIndex: 1,
  })),
}))

vi.mock('#/web/runtime-settings-fetch.ts', () => ({ getRuntimeFetchSettings: mocks.getFetchSettings }))
vi.mock('#/web/runtime-settings-telegram-notifications.ts', () => ({
  getRuntimeTelegramNotificationSettings: mocks.getTelegramSettings,
}))
vi.mock('#/web/settings-client.ts', () => ({ sendTelegramOutputCompletionNotification: mocks.send }))
vi.mock('#/web/components/terminal/terminal-notification-context.ts', () => ({
  terminalNotificationContext: mocks.context,
}))

const intent: TerminalOutputCompletionIntent & { activityDurationMs: number } = {
  descriptor: {
    key: 'terminal-key',
    worktreeTerminalKey: 'worktree-key',
    terminalId: 'terminal-1',
    index: 1,
    repoRoot: '/repo',
    branch: 'main',
    worktreePath: '/repo',
  },
  sessionId: 'session-1',
  finalOutputSeq: 42,
  activityDurationMs: 10_000,
  processName: 'bun',
}

describe('terminal output completion controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getFetchSettings.mockReturnValue({ terminalNotificationsEnabled: true })
    mocks.getTelegramSettings.mockReturnValue({
      enabled: true,
      botTokenConfigured: true,
      chatId: '-100123',
      proxyEnabled: true,
      bellEnabled: true,
      outputCompletionEnabled: true,
      outputCompletionMinimumActivitySeconds: 10,
      includeTerminalOutput: true,
      outputTailLength: 400,
    })
  })

  test('sends completion context independently of terminal focus', async () => {
    const { notifyTerminalOutputCompletion } =
      await import('#/web/components/terminal/terminal-output-completion-controller.ts')
    notifyTerminalOutputCompletion(intent)
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1))
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        finalOutputSeq: 42,
        activityDurationMs: 10_000,
      }),
    )
    expect(mocks.send.mock.calls[0]?.[0]).not.toHaveProperty('outputTail')
  })

  test('sends only activity periods at or above the configured minimum', async () => {
    const { notifyTerminalOutputCompletion } =
      await import('#/web/components/terminal/terminal-output-completion-controller.ts')

    notifyTerminalOutputCompletion({ ...intent, activityDurationMs: 9_999 })
    expect(mocks.send).not.toHaveBeenCalled()

    notifyTerminalOutputCompletion({ ...intent, activityDurationMs: 10_000 })
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1))
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ activityDurationMs: 10_000 }))
  })

  test('never transports renderer output even when inclusion is enabled', async () => {
    const { notifyTerminalOutputCompletion } =
      await import('#/web/components/terminal/terminal-output-completion-controller.ts')
    notifyTerminalOutputCompletion(intent)
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1))
    expect(mocks.send.mock.calls[0]?.[0]).not.toHaveProperty('outputTail')
  })
})
