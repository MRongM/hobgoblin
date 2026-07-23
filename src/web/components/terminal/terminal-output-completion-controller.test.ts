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
    outputTail: 'done',
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

const intent: TerminalOutputCompletionIntent = {
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
  processName: 'bun',
  outputTail: 'done',
}

describe('terminal output completion controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getFetchSettings.mockReturnValue({ terminalNotificationsEnabled: true })
    mocks.getTelegramSettings.mockReturnValue({
      enabled: true,
      botTokenConfigured: true,
      chatId: '-100123',
      bellEnabled: true,
      outputCompletionEnabled: true,
      includeTerminalOutput: true,
    })
  })

  test('sends completion context independently of terminal focus', async () => {
    const { notifyTerminalOutputCompletion } = await import(
      '#/web/components/terminal/terminal-output-completion-controller.ts'
    )
    notifyTerminalOutputCompletion(intent)
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1))
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: 'session-1', finalOutputSeq: 42, outputTail: 'done' }),
    )
  })

  test('omits output when terminal output inclusion is disabled', async () => {
    mocks.getTelegramSettings.mockReturnValue({
      ...mocks.getTelegramSettings(),
      includeTerminalOutput: false,
    })
    const { notifyTerminalOutputCompletion } = await import(
      '#/web/components/terminal/terminal-output-completion-controller.ts'
    )
    notifyTerminalOutputCompletion(intent)
    await vi.waitFor(() => expect(mocks.send).toHaveBeenCalledTimes(1))
    expect(mocks.send.mock.calls[0]?.[0]).not.toHaveProperty('outputTail')
  })
})
